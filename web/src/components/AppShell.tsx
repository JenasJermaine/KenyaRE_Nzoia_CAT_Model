"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useModel } from "./ModelProvider";
import { SettingsPanel } from "./SettingsPanel";
import { SignIn } from "./SignIn";
import { cx, Spinner } from "./ui";

const NAV = [
  { href: "/", label: "Underwriting desk" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/methodology", label: "Model & assumptions" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data, error, llm, ingested, settings, mcRunning, auth, signOut } = useModel();
  const needsSignIn = auth?.required === true && !auth.user;
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
              <span className="block text-[11px] text-slate-500">Underwriting decision support</span>
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
            <span
              title={llm?.llm ? `Connected to ${llm.provider}` : "Set GEMINI_API_KEY or OPENAI_API_KEY to enable the LLM; rule-based fallback active"}
              className={cx(
                "hidden items-center gap-1.5 px-2 py-1 text-[11px] font-medium sm:inline-flex",
                llm?.llm ? "text-ink" : "text-grey",
              )}
            >
              <span className={cx("h-2 w-2", llm?.llm ? "bg-ink" : "bg-river")} />
              {llm == null ? "LLM: …" : llm.llm ? `LLM: ${llm.model}` : "LLM: offline fallback"}
            </span>
            {auth?.user && (
              <span className="hidden items-center gap-2 border-l border-slate-200 pl-3 text-[12px] text-ink md:inline-flex">
                <span>
                  Signed in as <b>{auth.user}</b>
                </span>
                <button type="button" onClick={() => void signOut()} className="text-river hover:underline">
                  Sign out
                </button>
              </span>
            )}
            {auth?.required === false && (
              <span
                title="Set APP_ACCESS_TOKEN in web/.env.local to require a passcode before anyone can use the AI or change the portfolio."
                className="hidden border border-river px-2 py-0.5 text-[11px] font-medium text-river md:inline-flex"
              >
                No passcode set
              </span>
            )}
            <button
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
            </button>
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
            <span className="font-semibold uppercase tracking-wide text-ink">Read this first</span>
            <span>
              <b className="text-ink">Hazard: real</b> JRC river-flood depth maps
            </span>
            <span>
              <b className="text-ink">Portfolio: synthetic</b>, 500 generated buildings, not a real client
              {ingested.length > 0 && ` (+${ingested.length} AI-ingested, also synthetic)`}
            </span>
            <span>
              <b className="text-ink">Vulnerability &amp; terms: assumptions</b>, documented on the Model &amp; assumptions page
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-7">
        {error ? (
          <div className="border border-river bg-river-50 p-6 text-ai">
            <b>Model artefacts could not be loaded.</b> {error}
          </div>
        ) : needsSignIn ? (
          <SignIn />
        ) : (
          <>
            {!data && (
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
            Hackathon prototype — not a production pricing tool.
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
