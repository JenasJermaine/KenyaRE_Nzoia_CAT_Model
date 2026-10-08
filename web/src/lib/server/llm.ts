import "server-only";

/**
 * Minimal LLM client. Two backends, configured through environment variables only:
 *  - Google Gemini (AI Studio key) via the native generateContent API, used when GEMINI_API_KEY is set;
 *  - any OpenAI-compatible chat-completions endpoint (OpenAI, OpenRouter, Groq, Together, a local Ollama/vLLM
 *    server, ...), used when OPENAI_API_KEY is set.
 */
export type LlmProvider = "gemini" | "openai";

export function llmConfig() {
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  if (geminiKey.length > 0) {
    return {
      enabled: true,
      provider: "gemini" as LlmProvider,
      apiKey: geminiKey,
      model: process.env.GEMINI_MODEL || "gemini-flash-latest",
      baseUrl: (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, ""),
    };
  }
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  return {
    enabled: apiKey.length > 0,
    provider: "openai" as LlmProvider,
    apiKey,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
  };
}

export interface ChatImage {
  mimeType: string;
  /** Base64 without the data: prefix. */
  data: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** User-message images; both backends accept them on vision-capable models. */
  images?: ChatImage[];
}

interface ChatOptions {
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface ChatResult {
  text: string;
  /** The model that actually answered (Gemini may fall back from a retired model). */
  model: string;
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
  const cfg = llmConfig();
  if (!cfg.enabled) throw new Error("LLM not configured");
  return cfg.provider === "gemini" ? chatGemini(cfg, messages, opts) : chatOpenAi(cfg, messages, opts);
}

type Config = ReturnType<typeof llmConfig>;

async function chatOpenAi(cfg: Config, messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: messages.map((m) =>
        m.images?.length
          ? {
              role: m.role,
              content: [
                { type: "text", text: m.content },
                ...m.images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.data}` } })),
              ],
            }
          : { role: m.role, content: m.content },
      ),
      temperature: opts.temperature ?? 0.1,
      max_tokens: opts.maxTokens ?? 1800,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned an empty response");
  return { text: content, model: cfg.model };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

// Gemini 2.5+ "thinking" tokens count against maxOutputTokens, so the visible-answer budget needs headroom.
const GEMINI_THINKING_HEADROOM = 8192;

// Google retires model versions for new keys regularly and free-tier models are often overloaded (503) or
// rate-limited per model (429); in those cases these are tried in order.
const GEMINI_FALLBACK_MODELS = ["gemini-flash-latest", "gemini-3.8-flash", "gemini-flash-lite-latest"];
const OVERLOAD_RETRY_DELAY_MS = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chatGemini(cfg: Config, messages: ChatMessage[], opts: ChatOptions): Promise<ChatResult> {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }, ...(m.images ?? []).map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } }))],
    }));
  const body = JSON.stringify({
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.1,
      maxOutputTokens: (opts.maxTokens ?? 1800) + GEMINI_THINKING_HEADROOM,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  });

  const call = (model: string) =>
    fetch(`${cfg.baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
    });

  const models = [cfg.model, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== cfg.model)];
  const skipped: string[] = [];
  for (const model of models) {
    let res = await call(model);
    if (res.status === 503 || res.status === 500) {
      await sleep(OVERLOAD_RETRY_DELAY_MS);
      res = await call(model);
    }
    if (res.status === 404 || res.status === 429 || res.status === 503 || res.status === 500) {
      skipped.push(`${model}: ${res.status === 404 ? "not available" : res.status === 429 ? "rate-limited" : "overloaded"}`);
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Gemini request failed (${res.status}, ${model}): ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as GeminiResponse;
    if (data.promptFeedback?.blockReason) throw new Error(`Gemini blocked the prompt (${data.promptFeedback.blockReason})`);
    const candidate = data.candidates?.[0];
    const content = (candidate?.content?.parts ?? [])
      .filter((p) => !p.thought && p.text)
      .map((p) => p.text)
      .join("");
    if (!content) throw new Error(`Gemini returned an empty response (finishReason: ${candidate?.finishReason ?? "unknown"})`);
    return { text: content, model };
  }
  throw new Error(`No Gemini model could answer (${skipped.join("; ")}). Free-tier spikes are usually temporary — retry shortly.`);
}
