"use client";

import { useRef, useState } from "react";
import { extractDocxText } from "@/lib/docx";
import { Spinner } from "../ui";

const EXAMPLES: { label: string; text: string }[] = [
  {
    label: "Mixed Budalangi book",
    text: "12 mabati shops by the river in Budalangi, about KES 150,000 each. Also a two-storey concrete secondary school in Port Victoria worth KES 45 million, and 30 semi-permanent mud-walled homes on the floodplain near Rwambwa.",
  },
  {
    label: "Busia & Sio Port",
    text: "A portfolio of 40 brick bungalows in Busia town, roughly 110 m² each, plus 8 warehouses (godowns) near Sio Port valued at KES 18M each, raised on 0.6 m plinths.",
  },
  {
    label: "Swahili / local terms",
    text: "Nyumba 25 za udongo (mud houses) karibu na mto Nzoia huko Bunyala, and 5 dukas made of iron sheet at Usenge lakeshore.",
  },
];

export function OfferInput({
  text,
  setText,
  busy,
  llmOn,
  onExtract,
}: {
  text: string;
  setText: (t: string) => void;
  busy: boolean;
  /** null while the LLM status is still loading. */
  llmOn: boolean | null;
  onExtract: (forceRules: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileErr(null);
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith(".docx")) setText(await extractDocxText(file));
      else if (name.endsWith(".txt") || name.endsWith(".md") || name.endsWith(".csv")) setText(await file.text());
      else throw new Error("Upload a Word (.docx) or text (.txt) file — for PDFs, copy the text and paste it here.");
      setFileName(file.name);
    } catch (e) {
      setFileErr((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-3 transition hover:border-river/40"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onFile(e.dataTransfer.files[0]);
        }}
      >
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFileName(null);
          }}
          rows={7}
          className="w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed focus:border-river focus:outline-none focus:ring-2 focus:ring-river/20"
          placeholder="Paste a broker offer or survey report, describe the properties in plain English, or drop a .docx file here…"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">
            Upload offer (.docx / .txt)
          </button>
          <input ref={fileRef} type="file" accept=".docx,.txt,.md,.csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          {fileName && <span className="rounded bg-teal-50 px-2 py-0.5 text-real">Loaded {fileName}</span>}
          <span className="ml-auto">{text.length.toLocaleString()} characters</span>
        </div>
        {fileErr && <p className="mt-1 text-xs text-red-600">{fileErr}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">Or try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => {
              setText(ex.text);
              setFileName(null);
            }}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200"
          >
            {ex.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => onExtract(false)}
          className="rounded-md bg-river px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-lake disabled:opacity-50"
        >
          {busy ? "Reading the offer…" : llmOn === null ? "Extract buildings" : llmOn ? "Extract buildings with AI" : "Extract buildings (rule-based)"}
        </button>
        {llmOn && (
          <button type="button" disabled={busy || !text.trim()} onClick={() => onExtract(true)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            Compare: keyword parser (no AI)
          </button>
        )}
        {busy && <Spinner label="Free-tier Gemini can take up to a minute on long documents" />}
      </div>
    </div>
  );
}
