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
  addIngested: (bs: Building[]) => Promise<void>;
  removeBatch: (batchId: string) => Promise<void>;
  clearIngested: () => Promise<void>;
  portfolioStorage: { storage: "sqlite"; file: string } | null;
  portfolioError: string | null;
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

async function loadIngested() {
  const res = await fetch("/api/portfolio");
  const body = (await res.json()) as { buildings?: Building[]; storage?: "sqlite"; file?: string; error?: string };
  if (!res.ok || !body.buildings || !body.storage || !body.file) {
    throw new Error(body.error ?? "Could not load the SQLite portfolio.");
  }
  return { buildings: body.buildings, storage: body.storage, file: body.file };
}

async function saveIngested(buildings: Building[]) {
  const res = await fetch("/api/portfolio", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buildings }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Could not save the SQLite portfolio.");
  }
}

export function ModelProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ModelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ingested, setIngested] = useState<Building[]>([]);
  const [portfolioStorage, setPortfolioStorage] = useState<ModelState["portfolioStorage"]>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [mcState, setMcState] = useState<{ input: object; result: McResult } | null>(null);
  const [llm, setLlm] = useState<ModelState["llm"]>(null);

  useEffect(() => {
    Promise.all([
      loadJson<ModelData["portfolio"]>("portfolio"),
      loadJson<ModelData["hazard"]>("hazard"),
      loadJson<ModelData["vulnerability"]>("vulnerability"),
      loadJson<ModelData["results"]>("results"),
      loadJson<ModelData["gazetteer"]>("gazetteer"),
      loadExplain(),
      loadIngested(),
    ])
      .then(async ([portfolio, hazard, vulnerability, results, gazetteer, explain, stored]) => {
        let storedBuildings = stored.buildings;
        try {
          const s = localStorage.getItem(SETTINGS_KEY);
          if (s) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(s) });
          // One-time migration from the previous browser-only storage. Merge by ID so reloading cannot duplicate rows.
          const i = localStorage.getItem(INGESTED_KEY);
          if (i) {
            const legacy = JSON.parse(i) as Building[];
            if (Array.isArray(legacy) && legacy.length) {
              const merged = new Map(storedBuildings.map((b) => [b.id, b]));
              for (const building of legacy) merged.set(building.id, building);
              storedBuildings = [...merged.values()];
              await saveIngested(storedBuildings);
            }
            localStorage.removeItem(INGESTED_KEY);
          }
        } catch {
          /* corrupted legacy local storage is ignored */
        }
        setIngested(storedBuildings);
        setPortfolioStorage({ storage: stored.storage, file: stored.file });
        setHydrated(true);
        setData({ portfolio, hazard, vulnerability: { ...vulnerability, classColors: CLASS_COLORS }, results, gazetteer, explain });
      })
      .catch((e: Error) => setError(e.message));
    fetch("/api/status")
      .then((r) => r.json())
      .then(setLlm)
      .catch(() => setLlm({ llm: false, model: null, provider: null }));
  }, []);

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
  const persistIngested = useCallback(async (next: Building[]) => {
    try {
      await saveIngested(next);
      setIngested(next);
      setPortfolioError(null);
    } catch (e) {
      const message = (e as Error).message;
      setPortfolioError(message);
      throw e;
    }
  }, []);
  const addIngested = useCallback((bs: Building[]) => persistIngested([...ingested, ...bs]), [ingested, persistIngested]);
  const removeBatch = useCallback(
    (id: string) => persistIngested(ingested.filter((b) => b.batchId !== id)),
    [ingested, persistIngested],
  );
  const clearIngested = useCallback(() => persistIngested([]), [persistIngested]);

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
    portfolioStorage,
    portfolioError,
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
