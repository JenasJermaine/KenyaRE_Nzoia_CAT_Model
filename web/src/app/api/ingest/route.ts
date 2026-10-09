import { createHash } from "node:crypto";
import { ingestResponseSchema, ingestSystemPrompt, ruleBasedParse, sanitizeGroups } from "@/lib/ingest";
import { scanForInjection, wrapUntrusted } from "@/lib/injection";
import { audit } from "@/lib/server/audit";
import { requireRoles } from "@/lib/server/auth";
import { aiFailure } from "@/lib/server/errors";
import { chat, llmConfig } from "@/lib/server/llm";
import { placeNames } from "@/lib/server/gazetteer";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { describeIssue, imageSchema, ingestBodySchema } from "@/lib/server/schemas";
import { MAX_PHOTOS } from "@/lib/photos";
import type { IngestImage, IngestResponse } from "@/lib/types";

// Full underwriting submissions (offer slips, surveys) run to tens of thousands of characters.
const MAX_INPUT_CHARS = 100_000;
// Photos are resized to ~1024 px in the browser; this only rejects payloads that skipped that step.
const MAX_PHOTO_B64_CHARS = 2_000_000;
const PHOTOS_ONLY_TEXT = "(No written description was supplied. Use the attached building photos only.)";

/** File names reach the prompt, so they are reduced to plain characters. */
const cleanName = (name: unknown) => String(name ?? "photo").replace(/[^\p{L}\p{N} ._()-]/gu, "_").slice(0, 80) || "photo";

function validImages(list: unknown[]): { images: IngestImage[]; warnings: string[] } {
  const images: IngestImage[] = [];
  const warnings: string[] = [];
  for (const item of list) {
    const parsed = imageSchema.safeParse(item);
    const name = cleanName((item as { name?: unknown } | null)?.name);
    if (images.length >= MAX_PHOTOS) {
      warnings.push(`Only the first ${MAX_PHOTOS} photos were used; "${name}" was skipped.`);
    } else if (!parsed.success) {
      warnings.push(`"${name}" is not a JPEG, PNG or WebP image and was skipped.`);
    } else if (parsed.data.data.length > MAX_PHOTO_B64_CHARS) {
      warnings.push(`"${name}" is too large (over ~1.5 MB after resizing) and was skipped.`);
    } else {
      images.push({ name, mimeType: parsed.data.mimeType, data: parsed.data.data });
    }
  }
  return { images, warnings };
}

function sourceHash(text: string, images: IngestImage[]) {
  const h = createHash("sha256").update(text);
  for (const img of images) h.update("\0").update(img.data);
  return h.digest("hex");
}

export async function POST(request: Request) {
  const guard = requireRoles(request, ["underwriter", "cedant"]);
  if (!guard.ok) return guard.response;
  const body = ingestBodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: `The request was not understood: ${describeIssue(body.error)}.` }, { status: 400 });

  const { images, warnings: photoWarnings } = validImages(body.data.images);
  const raw = body.data.text.trim();
  if (!raw && !images.length) return Response.json({ error: "Provide a portfolio description or at least one building photo." }, { status: 400 });
  const text = raw.slice(0, MAX_INPUT_CHARS);
  const truncated = raw.length > MAX_INPUT_CHARS ? [`Input truncated to the first ${MAX_INPUT_CHARS.toLocaleString()} characters.`] : [];
  const hash = sourceHash(text, images);
  const flags = [...scanForInjection(text), ...images.flatMap((img) => scanForInjection(img.name, "photo file name"))];
  const security = { flags };

  const names = await placeNames();
  const cfg = llmConfig();
  const record = (mode: "llm" | "rules", model: string | null, groups: number, failure?: string) =>
    audit("ingest", guard.actor, guard.ip, { mode, model, sourceHash: hash, chars: text.length, photos: images.length, groups, injectionFlags: flags.length, ...(failure ? { failure } : {}) });

  if (cfg.enabled && !body.data.forceRules) {
    const wait = rateLimit("ai", guard.ip);
    if (wait) return tooManyRequests(wait, "AI extraction");
    try {
      const photoList = images.length ? `\n\nAttached photos:\n${images.map((img, i) => `Photo ${i + 1}: ${img.name}`).join("\n")}` : "";
      const { text: content, model } = await chat(
        [
          { role: "system", content: ingestSystemPrompt(names, images.length) },
          { role: "user", content: wrapUntrusted((text || PHOTOS_ONLY_TEXT) + photoList), images: images.map(({ mimeType, data }) => ({ mimeType, data })) },
        ],
        { json: true, responseSchema: ingestResponseSchema(images.length), temperature: 0, maxTokens: 8000, timeoutMs: 120_000 },
      );
      const parsed = sanitizeGroups(JSON.parse(content), names, images.length);
      record("llm", model, parsed.groups.length);
      const res: IngestResponse = {
        ...parsed,
        warnings: [...photoWarnings, ...truncated, ...parsed.warnings],
        mode: "llm",
        model,
        photos: { sent: images.length, read: images.length > 0 },
        sourceHash: hash,
        security,
      };
      return Response.json(res);
    } catch (err) {
      const failure = aiFailure("ingest", err);
      const res = rulesResponse(text, names, images.length, [`The AI extractor could not be used. ${failure.message} The keyword parser was used instead.`, ...photoWarnings, ...truncated]);
      record("rules", null, res.groups.length, failure.kind);
      return Response.json({ ...res, sourceHash: hash, security });
    }
  }

  const res = rulesResponse(text, names, images.length, [...photoWarnings, ...truncated]);
  record("rules", null, res.groups.length);
  return Response.json({ ...res, sourceHash: hash, security });
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
