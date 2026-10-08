"use client";

import { useState, type FormEvent } from "react";
import { useModel } from "./ModelProvider";

export function SignIn() {
  const { signIn } = useModel();
  const [name, setName] = useState("");
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
        <h1 className="text-lg font-semibold text-ink">Sign in to the underwriting desk</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-grey">
          Enter your name and the team passcode. Your name is recorded in the audit trail next to every offer you accept or remove.
        </p>
        <label className="mt-5 block text-[12px] font-medium text-ink">
          Your name
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={40} required />
        </label>
        <label className="mt-3 block text-[12px] font-medium text-ink">
          Team passcode
          <input className={field} type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} autoComplete="current-password" required />
        </label>
        {err && <p className="mt-3 border-l-4 border-river bg-river-50 px-3 py-2 text-[13px] text-ink">{err}</p>}
        <button
          type="submit"
          disabled={busy || !name.trim() || !passcode}
          className="mt-5 w-full rounded-[10px] bg-river px-4 py-2.5 text-sm font-semibold text-white hover:bg-lake disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="mt-3 text-[11px] text-grey">You stay signed in for 12 hours on this browser.</p>
      </form>
    </div>
  );
}
