"use client";

import { useState, type FormEvent } from "react";
import { DEMO_ACCOUNTS, ROLE_LABELS } from "@/lib/roles";
import { useModel } from "./ModelProvider";

export function SignIn() {
  const { signIn } = useModel();
  const [name, setName] = useState(DEMO_ACCOUNTS[0].email);
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await signIn(name.trim(), passcode);
    } catch (error) {
      setErr((error as Error).message);
      setPasscode("");
    } finally {
      setBusy(false);
    }
  }

  const field = "mt-1 block w-full border border-slate-300 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink";
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <form onSubmit={submit} className="w-full max-w-sm border border-slate-200 border-t-4 border-t-river bg-white p-6">
        <h1 className="text-lg font-semibold text-ink">Choose a demo role</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-grey">
          Prototype accounts show different views of the same CAT model. This demo login is not production authentication.
        </p>
        <label className="mt-5 block text-[12px] font-medium text-ink">
          Account and role
          <select className={field} value={name} onChange={(e) => setName(e.target.value)}>
            {DEMO_ACCOUNTS.map((account) => (
              <option key={account.email} value={account.email}>{ROLE_LABELS[account.role]} · {account.email}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-[12px] font-medium text-ink">
          Demo password
          <input className={field} type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="current-password" required />
        </label>
        <p className="mt-2 text-[11px] text-grey">Default demo password: <code>nzoia-demo</code>. The host may override it with <code>NZOIA_DEMO_PASSWORD</code> or <code>APP_ACCESS_TOKEN</code>.</p>
        {err && <p className="mt-3 border-l-4 border-river bg-river-50 px-3 py-2 text-[13px] text-ink">{err}</p>}
        <button
          type="submit"
          disabled={busy || !name || !passcode}
          className="mt-5 w-full rounded-[10px] bg-river px-4 py-2.5 text-sm font-semibold text-white hover:bg-lake disabled:opacity-50"
        >
          {busy ? "Opening role view…" : "Continue to role view"}
        </button>
        <p className="mt-3 text-[11px] text-grey">You stay signed in for 12 hours on this browser.</p>
      </form>
    </div>
  );
}
