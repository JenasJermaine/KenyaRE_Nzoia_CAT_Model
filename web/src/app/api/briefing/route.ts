import { briefingSystemPrompt, templateBriefing, type BriefingPayload } from "@/lib/briefing";
import { scanForInjection, wrapUntrusted } from "@/lib/injection";
import { audit } from "@/lib/server/audit";
import { requireUser } from "@/lib/server/auth";
import { aiFailure } from "@/lib/server/errors";
import { chat, llmConfig } from "@/lib/server/llm";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { briefingPayloadSchema, describeIssue } from "@/lib/server/schemas";

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

export async function POST(request: Request) {
  const guard = requireUser(request);
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => null)) as { payload?: unknown; forceTemplate?: unknown } | null;
  const parsed = briefingPayloadSchema.safeParse(body?.payload);
  if (!parsed.success) {
    return Response.json({ error: `The model results sent for the briefing were incomplete or invalid: ${describeIssue(parsed.error)}. Reload the page and try again.` }, { status: 400 });
  }
  const payload: BriefingPayload = parsed.data;
  const flags = scanForInjection(strings(payload).join("\n"), "offer text");
  const template = (warning?: string) => Response.json({ markdown: templateBriefing(payload), mode: "template", model: null, ...(warning ? { warning } : {}) });
  const record = (mode: "llm" | "template", model: string | null, failure?: string) =>
    audit("briefing", guard.actor, guard.ip, { mode, model, offer: Boolean(payload.offer), injectionFlags: flags.length, ...(failure ? { failure } : {}) });

  const cfg = llmConfig();
  if (!cfg.enabled || body?.forceTemplate === true) {
    record("template", null);
    return template();
  }
  if (flags.length) {
    record("template", null, "injection_flagged");
    return template("Parts of the offer text look like instructions aimed at the AI, so the AI briefing was skipped and the standard template is shown instead. Check the submission.");
  }
  const wait = rateLimit("ai", guard.ip);
  if (wait) return tooManyRequests(wait, "AI briefing");
  try {
    const { text: markdown, model } = await chat(
      [
        { role: "system", content: briefingSystemPrompt() },
        { role: "user", content: `Model output (JSON):\n${wrapUntrusted(JSON.stringify(payload))}` },
      ],
      { temperature: 0.3, maxTokens: 1500, timeoutMs: 120_000 },
    );
    record("llm", model);
    return Response.json({ markdown, mode: "llm", model });
  } catch (err) {
    const failure = aiFailure("briefing", err);
    record("template", null, failure.kind);
    return template(`The AI briefing could not be written. ${failure.message} The standard template is shown instead.`);
  }
}
