import { briefingSystemPrompt, templateBriefing, type BriefingPayload } from "@/lib/briefing";
import { chat, llmConfig } from "@/lib/server/llm";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { payload?: BriefingPayload; forceTemplate?: boolean } | null;
  const payload = body?.payload;
  if (!payload || !Array.isArray(payload.lossByReturnPeriod)) {
    return Response.json({ error: "Missing model payload." }, { status: 400 });
  }
  const cfg = llmConfig();
  if (cfg.enabled && !body?.forceTemplate) {
    try {
      const { text: markdown, model } = await chat(
        [
          { role: "system", content: briefingSystemPrompt() },
          { role: "user", content: `Model output (JSON):\n${JSON.stringify(payload)}` },
        ],
        { temperature: 0.3, maxTokens: 1500, timeoutMs: 120_000 },
      );
      return Response.json({ markdown, mode: "llm", model });
    } catch (err) {
      return Response.json({
        markdown: templateBriefing(payload),
        mode: "template",
        model: null,
        warning: `LLM call failed (${(err as Error).message}); showing the deterministic template.`,
      });
    }
  }
  return Response.json({ markdown: templateBriefing(payload), mode: "template", model: null });
}
