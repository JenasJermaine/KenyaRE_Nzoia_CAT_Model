"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  accumulation,
  classSummary,
  epCurve,
  rpTable,
  simulate,
  topBuildings,
  waterfallTable,
  type EpResult,
  type McResult,
} from "@/lib/engine";
import { api, AUTH_EXPIRED_EVENT, sendJson } from "@/lib/api";
import { buildHazardIndex, type HazardIndex } from "@/lib/geo";
import { CLASS_COLORS } from "@/lib/palette";
import { DEFAULT_SETTINGS, type Building, type ExplainData, type ModelData, type Settings } from "@/lib/types";

type RpRow = ReturnType<typeof rpTable>[number];
type WaterfallRow = ReturnType<typeof waterfallTable>[number];

export interface ModelState {
  data: ModelData | null;
  error: string | null;
  hazardIndex: HazardIndex | null;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  resetSettings: () => void;
  ingested: Building[];
  addIngested: (batchId: string, bs: Building[], sourceHash?: string) => Promise<void>;
  removeBatch: (batchId: string) => Promise<void>;
  clearIngested: () => Promise<void>;
  /** Set once the saved AI-ingested buildings have been loaded from the server database. */
  portfolioStorage: "sqlite" | null;
  portfolioError: string | null;
  /** `required` is false when the server has no passcode configured (open local mode). */
  auth: AuthState | null;
  signIn: (name: string, passcode: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Bumped after every portfolio change so views such as the audit trail can refresh. */
  revision: number;
  portfolio: Building[];
  det: {
    table: RpRow[];
    tableJrc: RpRow[];
    waterfall: WaterfallRow[];
    ep: EpResult;
    classes: ReturnType<typeof classSummary>;
    areas: ReturnType<typeof accumulation>;
    top: ReturnType<typeof topBuildings>;
    totalTiv: number;
  } | null;
  mc: McResult | null;
  mcRunning: boolean;
  llm: { llm: boolean; model: string | null; provider: string | null } | null;
}

const Ctx = createContext<ModelState | null>(null);

const SETTINGS_KEY = "nzoia.settings.v1";
/** Legacy key, read once and migrated into SQLite. */
const INGESTED_KEY = "nzoia.ingested.v1";

async function loadJson<T>(name: string): Promise<T> {
  const res = await fetch(`/data/${name}.json`);
  if (!res.ok) throw new Error(`Could not load ${name}.json (${res.status}). Run the notebook to export artefacts.`);
  return res.json() as Promise<T>;
}

const loadExplain = () =>
  fetch("/data/explain.json")
    .then((r) => (r.ok ? (r.json() as Promise<ExplainData>) : null))
    .catch(() => null);

export interface AuthState {
  required: boolean;
  user: string | null;
}

const NONE: Building[] = [];

const loadIngested = () => api<{ buildings: Building[]; storage: "sqlite" }>("/api/portfolio");

/** One-time migration from the previous browser-only storage; batches already on the server are skipped. */
async function migrateLegacyIngested() {
  try {
    const raw = localStorage.getItem(INGESTED_KEY);
    if (!raw) return false;
    const legacy = JSON.parse(raw) as Building[];
    const batches = new Map<string, Building[]>();
    for (const b of Array.isArray(legacy) ? legacy : []) batches.set(b.batchId ?? "", [...(batches.get(b.batchId ?? "") ?? []), b]);
    for (const [batchId, buildings] of batches) {
      if (batchId) await sendJson("/api/portfolio", { batchId, buildings }).catch(() => null);
    }
    localStorage.removeItem(INGESTED_KEY);
    return batches.size > 0;
  } catch {
    return false;
  }
}

export function ModelProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ModelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loadedIngested, setIngested] = useState<Building[]>(NONE);
  const [portfolioStorage, setPortfolioStorage] = useState<ModelState["portfolioStorage"]>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [mcState, setMcState] = useState<{ input: object; result: McResult } | null>(null);
  const [llm, setLlm] = useState<ModelState["llm"]>(null);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    Promise.all([
      loadJson<ModelData["portfolio"]>("portfolio"),
      loadJson<ModelData["hazard"]>("hazard"),
      loadJson<ModelData["vulnerability"]>("vulnerability"),
      loadJson<ModelData["results"]>("results"),
      loadJson<ModelData["gazetteer"]>("gazetteer"),
      loadExplain(),
    ])
      .then(([portfolio, hazard, vulnerability, results, gazetteer, explain]) => {
        try {
          const s = localStorage.getItem(SETTINGS_KEY);
          if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
        } catch {
          /* corrupted settings are ignored */
        }
        setHydrated(true);
        setData({ portfolio, hazard, vulnerability: { ...vulnerability, classColors: CLASS_COLORS }, results, gazetteer, explain });
      })
      .catch((e: Error) => setError(e.message));
    api<ModelState["llm"]>("/api/status")
      .then(setLlm)
      .catch(() => setLlm({ llm: false, model: null, provider: null }));
    api<AuthState>("/api/auth")
      .then(setAuth)
      .catch(() => setAuth({ required: true, user: null }));
    const expired = () => setAuth((a) => (a ? { ...a, user: null } : a));
    window.addEventListener(AUTH_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expired);
  }, []);

  const signedIn = auth != null && (!auth.required || auth.user != null);
  const reloadIngested = useCallback(async () => {
    try {
      const stored = await loadIngested();
      setIngested(stored.buildings);
      setPortfolioStorage(stored.storage);
      setPortfolioError(null);
    } catch (e) {
      setPortfolioError((e as Error).message);
    } finally {
      setRevision((r) => r + 1);
    }
  }, []);

  useEffect(() => {
    if (signedIn) void migrateLegacyIngested().then(reloadIngested);
  }, [signedIn, reloadIngested]);
  // After sign-out the last loaded rows stay in state but are not shown.
  const ingested = signedIn ? loadedIngested : NONE;

  useEffect(() => {
    if (hydrated) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, hydrated]);

  const hazardIndex = useMemo(() => (data ? buildHazardIndex(data.hazard) : null), [data]);

  const portfolio = useMemo(() => {
    if (!data) return [];
    return settings.includeIngested ? [...data.portfolio, ...ingested] : data.portfolio;
  }, [data, ingested, settings.includeIngested]);

  const det = useMemo(() => {
    if (!data) return null;
    const v = data.vulnerability;
    return {
      table: rpTable(portfolio, v, settings),
      tableJrc: rpTable(portfolio, v, { ...settings, vulnModel: "jrc" }),
      waterfall: waterfallTable(portfolio, v, settings),
      ep: epCurve(portfolio, v, settings),
      classes: classSummary(portfolio, v, settings),
      areas: accumulation(portfolio, v, settings),
      top: topBuildings(portfolio, v, settings),
      totalTiv: portfolio.reduce((a, b) => a + b.tiv, 0),
    };
  }, [data, portfolio, settings]);

  const mcInput = useMemo(() => ({ portfolio, settings }), [portfolio, settings]);
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => {
      setMcState({ input: mcInput, result: simulate(mcInput.portfolio, data.vulnerability, mcInput.settings) });
    }, 300);
    return () => clearTimeout(t);
  }, [data, mcInput]);
  const mc = mcState?.result ?? null;
  const mcRunning = !!data && mcState?.input !== mcInput;

  const updateSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const resetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), []);
  /** Runs one portfolio change on the server, then reloads so the browser always shows what the database holds. */
  const mutate = useCallback(
    async (change: () => Promise<unknown>) => {
      try {
        await change();
      } catch (e) {
        setPortfolioError((e as Error).message);
        throw e;
      }
      await reloadIngested();
    },
    [reloadIngested],
  );
  const addIngested = useCallback(
    (batchId: string, buildings: Building[], sourceHash?: string) => mutate(() => sendJson("/api/portfolio", { batchId, buildings, sourceHash })),
    [mutate],
  );
  const removeBatch = useCallback((id: string) => mutate(() => api(`/api/portfolio?batch=${encodeURIComponent(id)}`, { method: "DELETE" })), [mutate]);
  const clearIngested = useCallback(() => mutate(() => api("/api/portfolio?all=1", { method: "DELETE" })), [mutate]);

  const signIn = useCallback(async (name: string, passcode: string) => {
    setAuth(await sendJson<AuthState>("/api/auth", { name, passcode }));
  }, []);
  const signOut = useCallback(async () => {
    setAuth(await api<AuthState>("/api/auth", { method: "DELETE" }));
  }, []);

  const value: ModelState = {
    data,
    error,
    hazardIndex,
    settings,
    updateSettings,
    resetSettings,
    ingested,
    addIngested,
    removeBatch,
    clearIngested,
    portfolioStorage: signedIn ? portfolioStorage : null,
    portfolioError,
    auth,
    signIn,
    signOut,
    revision,
    portfolio,
    det,
    mc,
    mcRunning,
    llm,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useModel() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useModel must be used inside <ModelProvider>");
  return v;
}
