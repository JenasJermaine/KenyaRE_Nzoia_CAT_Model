"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useModel } from "./ModelProvider";
import { SettingsPanel } from "./SettingsPanel";
import { SignIn } from "./SignIn";
import { cx, Spinner } from "./ui";
import { pageAllowed, ROLE_HOME, ROLE_LABELS } from "@/lib/roles";

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data, error, llm, ingested, settings, mcRunning, auth, signOut } = useModel();
  const needsSignIn = !auth?.user || !auth.role;
  const loginRoute = path === "/login";
  const canView = auth?.role ? pageAllowed(path, auth.role) : false;
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const nonDefault = settings.vulnModel !== "ml" || settings.hazardMode !== "point" || settings.duration !== 7;
  const NAV = auth?.role === "underwriter"
    ? [{ href: "/underwriter", label: "Underwriting desk" }, { href: "/portfolio", label: "Portfolio" }, { href: "/methodology", label: "Model & assumptions" }]
    : auth?.role === "portfolio_manager"
      ? [{ href: "/portfolio", label: "Exposure dashboard" }]
      : auth?.role === "cedant"
        ? [{ href: "/cedant", label: "Submission risk" }]
        : auth?.role === "county"
          ? [{ href: "/county", label: "Public flood risk" }]
            : [];
  const readFirst = auth?.role === "underwriter"
    ? ["Hazard: real JRC river-flood depth maps", `Portfolio: synthetic, 500 generated buildings${ingested.length > 0 ? ` (+${ingested.length} AI-ingested, also synthetic)` : ", not a real client"}`, "Vulnerability & terms are assumptions documented on Model & assumptions"]
    : auth?.role === "portfolio_manager"
      ? ["Exposure summaries use a synthetic demo book", "Flood hazard: JRC river-flood depth maps", "Risk thresholds are illustrative"]
      : auth?.role === "cedant"
        ? ["Your submission only", "Flood hazard: JRC river-flood depth maps", "Risk estimates are not a quote"]
        : auth?.role === "county"
          ? ["Public flood-hazard information only", "Flood depth: JRC river-flood maps", "No insurer-specific exposure is shown"]
          : ["Risk model prototype", "Exposure is synthetic", "Vulnerability and terms include assumptions"];

  useEffect(() => {
    if (!auth) return;
    if (!auth.user && !loginRoute) router.replace("/login");
    else if (auth.user && auth.role && loginRoute) router.replace(ROLE_HOME[auth.role]);
    else if (auth.user && auth.role && !canView) router.replace(ROLE_HOME[auth.role]);
  }, [auth, canView, loginRoute, router]);

  return (
    <div className="flex min-h-screen flex-col">
      <header ref={headerRef} className="sticky top-0 z-[1100] border-b border-slate-200 bg-white">
        <div className="bg-lake text-white">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-1.5 text-[11px] tracking-wide">
            <span className="font-medium">KENYA REINSURANCE CORPORATION LIMITED</span>
            <span className="hidden text-white/70 sm:block">Property &amp; Casualty · Innovation prototype</span>
          </div>
        </div>
        <div className="mx-auto flex max-w-[1400px] items-center gap-5 px-6 py-2.5">
          <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Kenya Re Nzoia Flood CAT Model">
            <Image
              src="https://kenyare.co.ke/themes/custom/kenyare/images/logo.png"
              alt="Kenya Re"
              width={595}
              height={316}
              priority
              className="h-12 w-auto object-contain sm:h-14"
            />
            <span className="hidden h-10 w-px bg-slate-200 sm:block" />
            <span className="leading-tight">
              <span className="block font-display text-[15px] font-semibold text-ink">Nzoia Flood CAT Model</span>
              <span className="block text-[11px] text-slate-500">{auth?.role ? ROLE_LABELS[auth.role] : "Role-based risk views"}</span>
            </span>
          </Link>
          <nav className="hidden flex-1 items-center justify-center gap-1 overflow-x-auto lg:flex">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={cx(
                  "relative whitespace-nowrap px-3 py-2 text-[13px] font-medium transition",
                  path === n.href
                    ? "text-river after:absolute after:inset-x-3 after:-bottom-2.5 after:h-0.5 after:bg-river"
                    : "text-slate-600 hover:text-river",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {mcRunning && <Spinner label="simulating" />}
            {auth?.role === "underwriter" || auth?.role === "cedant" ? <span
              title={llm?.llm ? `An API key is configured for ${llm.provider}; it is validated only when a request is made.` : "Set GEMINI_API_KEY or OPENAI_API_KEY to enable the LLM; rule-based fallback active"}
              className={cx(
                "hidden items-center gap-1.5 px-2 py-1 text-[11px] font-medium sm:inline-flex",
                llm?.llm ? "text-ink" : "text-grey",
              )}
            >
              <span className={cx("h-2 w-2", llm?.llm ? "bg-ink" : "bg-river")} />
              {llm == null ? "AI: …" : llm.llm ? `AI configured · ${llm.model}` : "AI unavailable · text fallback"}
            </span> : null}
            {auth?.user && auth.role && (
              <span className="hidden items-center gap-2 border-l border-slate-200 pl-3 text-[12px] text-ink md:inline-flex">
                <span>
                  <b>{ROLE_LABELS[auth.role]}</b> · {auth.user}
                </span>
                <button type="button" onClick={() => void signOut()} className="text-river hover:underline">
                  Sign out
                </button>
              </span>
            )}
            {auth?.user && (
              <span className="hidden border border-amber-700 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 md:inline-flex" title="Mock accounts are for this prototype only.">
                DEMO · not production auth
              </span>
            )}
            {auth?.role === "underwriter" && <button
              type="button"
              onClick={() => setOpen(true)}
              className={cx(
                "border px-3 py-1.5 text-sm font-medium transition",
                nonDefault
                  ? "border-river bg-river-50 text-river"
                  : "border-lake bg-lake text-white hover:border-river hover:bg-river",
              )}
            >
              Model settings{nonDefault ? " •" : ""}
            </button>}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-1.5 lg:hidden">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cx(
                "whitespace-nowrap border-b-2 px-2.5 py-1 text-xs font-medium",
                path === n.href ? "border-river text-river" : "border-transparent text-slate-600",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 bg-paper">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-5 gap-y-1 px-6 py-1.5 text-[11px] text-grey">
            <span className="font-semibold uppercase tracking-wide text-ink">Role context</span>
            {readFirst.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-7">
        {!auth ? (
          <div className="grid h-[60vh] place-items-center"><Spinner label="Checking demo role…" /></div>
        ) : error && auth.role === "underwriter" ? (
          <div className="border border-river bg-river-50 p-6 text-ai">
            <b>Model artefacts could not be loaded.</b> {error}
          </div>
        ) : loginRoute ? (
          children
        ) : needsSignIn ? (
          <SignIn />
        ) : !canView ? (
          <div className="border-l-4 border-river bg-river-50 p-5 text-sm text-ink">This view is not available to the selected demo role.</div>
        ) : (
          <>
            {!data && auth.role === "underwriter" && (
              <div className="grid h-[60vh] place-items-center">
                <Spinner label="Loading hazard rasters, portfolio and trained vulnerability model…" />
              </div>
            )}
            {children}
          </>
        )}
      </main>

      <footer className="mt-6 border-t-4 border-river bg-lake text-white">
        <div className="mx-auto grid max-w-[1400px] gap-3 px-6 py-5 sm:grid-cols-[auto_1fr] sm:items-center">
          <div>
            <div className="font-display text-sm font-semibold">Kenya Re · Nzoia Flood CAT Model</div>
            <div className="mt-0.5 text-[11px] text-white/60">Your partner in progress, your partner in protection.</div>
          </div>
          <div className="text-[11px] leading-relaxed text-white/65 sm:text-right">
            Hazard: JRC Global River Flood Hazard Maps. Vulnerability adapted from Huizinga et al. (2017). Exposure is synthetic.
            Prototype — not a production pricing tool.
          </div>
        </div>
      </footer>

      {open && (
        <div className="fixed inset-0 z-[1200] flex justify-end bg-slate-900/30" onClick={() => setOpen(false)}>
          <aside
            className="h-full w-full max-w-md overflow-y-auto border-l-4 border-river bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Model settings</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100">
                ✕
              </button>
            </div>
            <p className="mb-5 text-sm text-slate-500">
              Every page recomputes instantly. Defaults reproduce the notebook exactly.
            </p>
            <SettingsPanel compact />
          </aside>
        </div>
      )}
    </div>
  );
}
