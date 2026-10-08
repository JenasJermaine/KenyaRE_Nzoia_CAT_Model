import { ingestSystemPrompt, ruleBasedParse, sanitizeGroups } from "@/lib/ingest";
import { chat, llmConfig } from "@/lib/server/llm";
import { placeNames } from "@/lib/server/gazetteer";
import { MAX_PHOTOS } from "@/lib/photos";
import type { IngestImage, IngestResponse } from "@/lib/types";

// Full underwriting submissions (offer slips, surveys) run to tens of thousands of characters.
const MAX_INPUT_CHARS = 100_000;
// Photos are resized to ~1024 px in the browser; this only rejects payloads that skipped that step.
const MAX_PHOTO_B64_CHARS = 2_000_000;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PHOTOS_ONLY_TEXT = "(No written description was supplied. Use the attached building photos only.)";

function validImages(raw: unknown): { images: IngestImage[]; warnings: string[] } {
  const list = Array.isArray(raw) ? raw : [];
  const images: IngestImage[] = [];
  const warnings: string[] = [];
  for (const item of list) {
    const img = (item ?? {}) as Partial<IngestImage>;
    const name = String(img.name ?? "photo").slice(0, 80);
    if (images.length >= MAX_PHOTOS) {
      warnings.push(`Only the first ${MAX_PHOTOS} photos were used; "${name}" was skipped.`);
    } else if (!PHOTO_TYPES.has(String(img.mimeType)) || typeof img.data !== "string" || !/^[A-Za-z0-9+/=]+$/.test(img.data.slice(0, 200))) {
      warnings.push(`"${name}" is not a JPEG, PNG or WebP image and was skipped.`);
    } else if (img.data.length > MAX_PHOTO_B64_CHARS) {
      warnings.push(`"${name}" is too large (over ~1.5 MB after resizing) and was skipped.`);
    } else {
      images.push({ name, mimeType: img.mimeType as IngestImage["mimeType"], data: img.data });
    }
  }
  return { images, warnings };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { text?: string; forceRules?: boolean; images?: unknown };
  const { images, warnings: photoWarnings } = validImages(body.images);
  const raw = (body.text ?? "").trim();
  if (!raw && !images.length) return Response.json({ error: "Provide a portfolio description or at least one building photo." }, { status: 400 });
  const text = raw.slice(0, MAX_INPUT_CHARS);
  const truncated = raw.length > MAX_INPUT_CHARS ? [`Input truncated to the first ${MAX_INPUT_CHARS.toLocaleString()} characters.`] : [];

  const names = await placeNames();
  const cfg = llmConfig();

  if (cfg.enabled && !body.forceRules) {
    try {
      const photoList = images.length ? `\n\nAttached photos:\n${images.map((img, i) => `Photo ${i + 1}: ${img.name}`).join("\n")}` : "";
      const { text: content, model } = await chat(
        [
          { role: "system", content: ingestSystemPrompt(names, images.length) },
          { role: "user", content: (text || PHOTOS_ONLY_TEXT) + photoList, images: images.map(({ mimeType, data }) => ({ mimeType, data })) },
        ],
        { json: true, temperature: 0, maxTokens: 8000, timeoutMs: 120_000 },
      );
      const parsed = sanitizeGroups(JSON.parse(content), names, images.length);
      const res: IngestResponse = {
        ...parsed,
        warnings: [...photoWarnings, ...truncated, ...parsed.warnings],
        mode: "llm",
        model,
        photos: { sent: images.length, read: images.length > 0 },
      };
      return Response.json(res);
    } catch (err) {
      return Response.json(rulesResponse(text, names, images.length, [`LLM call failed (${(err as Error).message}); used the rule-based parser instead.`, ...photoWarnings, ...truncated]));
    }
  }

  return Response.json(rulesResponse(text, names, images.length, [...photoWarnings, ...truncated]));
}

function rulesResponse(text: string, names: string[], photoCount: number, warnings: string[]): IngestResponse {
  const fallback = ruleBasedParse(text, names);
  const photoNote = photoCount ? [`${photoCount} photo(s) were not used: the keyword parser cannot read images. Photos need the AI extractor.`] : [];
  return {
    ...fallback,
    warnings: [...warnings, ...photoNote, ...fallback.warnings],
    mode: "rules",
    model: null,
    photos: { sent: photoCount, read: false },
  };
}
