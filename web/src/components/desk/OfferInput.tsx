"use client";

import { useRef, useState } from "react";
import { extractDocxText } from "@/lib/docx";
import { MAX_PHOTOS, preparePhoto, type PhotoItem } from "@/lib/photos";
import { cx, Spinner } from "../ui";

const EXAMPLES: { label: string; text: string; photo?: string; credit?: string }[] = [
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
  {
    label: "Proposal + site photo",
    text: "Proposal: one single-storey retail shop of concrete block construction near the river at Budalangi, sum insured KES 2.4 million. Floor area approx. 60 m². Photo of the premises attached.",
    photo: "/samples/sample-mud-shop.jpg",
    credit: '"Mud homes" by Mathew Kemboi, CC BY-SA 4.0, Wikimedia Commons',
  },
];

export function OfferInput({
  text,
  setText,
  photos,
  setPhotos,
  busy,
  llmOn,
  onExtract,
}: {
  text: string;
  setText: (t: string) => void;
  photos: PhotoItem[];
  setPhotos: (p: PhotoItem[]) => void;
  busy: boolean;
  /** null while the LLM status is still loading. */
  llmOn: boolean | null;
  onExtract: (forceRules: boolean) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

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

  async function addPhotos(files: File[], base: PhotoItem[] = photos) {
    if (!files.length) return;
    setPhotoErr(null);
    setPreparing(true);
    const next = [...base];
    const errors: string[] = [];
    for (const file of files) {
      if (next.length >= MAX_PHOTOS) {
        errors.push(`Up to ${MAX_PHOTOS} photos per offer — the rest were skipped.`);
        break;
      }
      try {
        const p = await preparePhoto(file);
        if (!next.some((x) => x.id === p.id)) next.push(p);
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    setPhotos(next);
    setPhotoErr(errors.length ? errors.join(" ") : null);
    setPreparing(false);
    if (photoRef.current) photoRef.current.value = "";
  }

  async function loadExample(ex: (typeof EXAMPLES)[number]) {
    setText(ex.text);
    setFileName(null);
    setPhotos([]);
    if (!ex.photo) return;
    const blob = await fetch(ex.photo).then((r) => r.blob());
    await addPhotos([new File([blob], ex.photo.split("/").pop()!, { type: blob.type || "image/jpeg" })], []);
  }

  const canExtract = Boolean(text.trim()) || photos.length > 0;

  return (
    <div className="space-y-4">
      <div
        className="border border-slate-300 bg-white"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = [...e.dataTransfer.files];
          const images = files.filter((f) => f.type.startsWith("image/"));
          if (images.length) void addPhotos(images);
          const doc = files.find((f) => !f.type.startsWith("image/"));
          if (doc) void onFile(doc);
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-paper px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink">
          <span>Offer document</span>
          <span className="font-normal normal-case tracking-normal text-grey">{text.length.toLocaleString()} characters</span>
        </div>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFileName(null);
          }}
          rows={7}
          className="block w-full resize-y border-0 bg-white p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ink/20"
          placeholder="Paste a broker offer or survey report, describe the properties in plain English, or drop a .docx file here…"
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 px-3 py-2 text-xs text-grey">
          <button type="button" onClick={() => fileRef.current?.click()} className="border border-slate-300 bg-white px-2.5 py-1 font-medium text-ink hover:border-ink">
            Upload offer (.docx / .txt)
          </button>
          <input ref={fileRef} type="file" accept=".docx,.txt,.md,.csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          {fileName && <span className="border-l-[3px] border-ink bg-navy-50 px-2 py-0.5 text-ink">Loaded {fileName}</span>}
          {fileErr && <span className="text-ai">{fileErr}</span>}
        </div>
      </div>

      <div className="border border-slate-300 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-paper px-3 py-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink">
            Building photos <span className="font-normal normal-case tracking-normal text-grey">· optional, up to {MAX_PHOTOS}</span>
          </span>
          <span className="text-[11px] text-grey">Read by the AI for walls, roof, floor height and condition. The document wins on any conflict.</span>
        </div>
        <div className="flex flex-wrap items-stretch gap-3 p-3">
          {photos.map((p, i) => (
            <figure key={p.id} className="group relative w-[132px] border border-slate-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL thumbnail */}
              <img src={p.url} alt={`Photo ${i + 1}: ${p.name}`} className="h-[92px] w-full object-cover" />
              <span className="absolute left-0 top-0 bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-white">Photo {i + 1}</span>
              <button
                type="button"
                onClick={() => setPhotos(photos.filter((x) => x.id !== p.id))}
                className="absolute right-0 top-0 bg-white/90 px-1.5 text-xs text-ink hover:bg-river hover:text-white"
                aria-label={`Remove photo ${i + 1}`}
              >
                ✕
              </button>
              <figcaption className="truncate px-1.5 py-1 text-[10px] text-grey" title={p.name}>
                {p.name} · {p.kb} KB
              </figcaption>
            </figure>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              disabled={preparing}
              className="grid min-h-[118px] w-[132px] place-items-center border border-dashed border-slate-300 px-2 text-center text-xs text-grey hover:border-ink hover:text-ink disabled:opacity-50"
            >
              {preparing ? "Resizing…" : photos.length ? "+ Add another photo" : "+ Add photos, or drop them anywhere above"}
            </button>
          )}
          <input
            ref={photoRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => void addPhotos([...(e.target.files ?? [])])}
          />
          {photos.length > 0 && llmOn === false && (
            <p className="self-center text-xs text-ai">AI is offline, so photos will not be read. The keyword parser only uses the text.</p>
          )}
        </div>
        {photoErr && <p className="border-t border-slate-200 px-3 py-2 text-xs text-ai">{photoErr}</p>}
        {photos.length > 0 && (
          <p className="border-t border-slate-200 px-3 py-1.5 text-[11px] text-grey">
            Resized to ≤1024 px in your browser. Location and camera metadata were removed before upload; photos are not stored.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-l-4 border-river bg-navy-50 px-4 py-3">
        <button
          type="button"
          disabled={busy || preparing || !canExtract}
          onClick={() => onExtract(false)}
          className="bg-river px-5 py-2.5 text-sm font-semibold text-white hover:bg-river-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {busy
            ? photos.length
              ? "Analyzing offer and photos…"
              : "Analyzing offer…"
            : "Analyze offer and show building risks"}
        </button>
        {llmOn && (
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={() => onExtract(true)}
            className="border border-slate-300 px-3 py-2 text-sm text-grey hover:border-ink hover:text-ink disabled:opacity-50"
          >
            Compare: keyword parser (no AI)
          </button>
        )}
        <span className="text-xs text-slate-600">
          {canExtract ? "Review the extracted buildings and losses before deciding whether to accept." : "Enter offer text, upload a document, or add building photos to enable analysis."}
        </span>
      </div>
      {busy && <Spinner label="Free-tier Gemini can take up to a minute on long documents" />}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-grey">Or load an example:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            onClick={() => void loadExample(ex)}
            title={ex.credit ? `Sample photo: ${ex.credit}` : undefined}
            className={cx("border px-2.5 py-1 text-xs hover:border-ink hover:text-ink", ex.photo ? "border-river text-river" : "border-slate-300 text-grey")}
          >
            {ex.label}
          </button>
        ))}
      </div>
    </div>
  );
}
