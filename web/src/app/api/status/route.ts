import { connection } from "next/server";
import { llmConfig } from "@/lib/server/llm";

export async function GET() {
  await connection();
  const cfg = llmConfig();
  return Response.json({
    llm: cfg.enabled,
    model: cfg.enabled ? cfg.model : null,
    provider: cfg.enabled ? (cfg.provider === "gemini" ? "Google Gemini" : new URL(cfg.baseUrl).host) : null,
  });
}
