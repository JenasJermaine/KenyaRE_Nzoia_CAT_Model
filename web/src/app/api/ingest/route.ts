import { ingestSystemPrompt, ruleBasedParse, sanitizeGroups } from "@/lib/ingest";
import { chat, llmConfig } from "@/lib/server/llm";
import { placeNames } from "@/lib/server/gazetteer";
import type { IngestResponse } from "@/lib/types";

// Full underwriting submissions (offer slips, surveys) run to tens of thousands of characters.
const MAX_INPUT_CHARS = 100_000;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { text?: string; forceRules?: boolean };
  const raw = (body.text ?? "").trim();
  if (!raw) return Response.json({ error: "Provide a portfolio description." }, { status: 400 });
  const text = raw.slice(0, MAX_INPUT_CHARS);
  const truncated = raw.length > MAX_INPUT_CHARS ? [`Input truncated to the first ${MAX_INPUT_CHARS.toLocaleString()} characters.`] : [];

  const names = await placeNames();
  const cfg = llmConfig();

  if (cfg.enabled && !body.forceRules) {
    try {
      const { text: content, model } = await chat(
        [
          { role: "system", content: ingestSystemPrompt(names) },
          { role: "user", content: text },
        ],
        { json: true, temperature: 0, maxTokens: 8000, timeoutMs: 120_000 },
      );
      const parsed = sanitizeGroups(JSON.parse(content), names);
      const res: IngestResponse = { ...parsed, warnings: [...truncated, ...parsed.warnings], mode: "llm", model };
      return Response.json(res);
    } catch (err) {
      const fallback = ruleBasedParse(text, names);
      const res: IngestResponse = {
        ...fallback,
        warnings: [`LLM call failed (${(err as Error).message}); used the rule-based parser instead.`, ...truncated, ...fallback.warnings],
        mode: "rules",
        model: null,
      };
      return Response.json(res);
    }
  }

  const fallback = ruleBasedParse(text, names);
  const res: IngestResponse = { ...fallback, warnings: [...truncated, ...fallback.warnings], mode: "rules", model: null };
  return Response.json(res);
}
