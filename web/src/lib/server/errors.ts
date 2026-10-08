import "server-only";

import { randomBytes } from "node:crypto";
import { LlmError, type LlmErrorKind } from "./llm";

/** What the user is told for each failure category: the likely cause and what they can do, never the raw upstream text. */
const AI_MESSAGES: Record<LlmErrorKind | "unreadable", string> = {
  not_configured: "No AI service is configured on the server.",
  rate_limited: "The AI service's usage limit was reached (common on the free Gemini tier). Wait a minute and try again.",
  unavailable: "The AI service is busy or temporarily unavailable. Try again in a minute.",
  timeout: "The AI service took too long to answer. Try a shorter document or fewer photos, or try again.",
  network: "The server could not reach the AI service. Check the server's internet connection.",
  auth: "The AI service rejected the server's API key. Ask the administrator to check the key in the server settings.",
  blocked: "The AI service's safety filter refused this content. Remove anything unusual from the document or photos and try again.",
  empty: "The AI returned no usable answer. Try again.",
  upstream: "The AI service rejected the request. Try again; if it keeps happening, ask the administrator to check the server log.",
  unreadable: "The AI's answer could not be read as structured data. Try again.",
};

/** Logs the full error server-side and returns a short reference the user can quote to whoever reads the log. */
export function logIncident(scope: string, error: unknown) {
  const ref = randomBytes(3).toString("hex").toUpperCase();
  console.error(`[${scope}] incident ${ref}:`, error);
  return ref;
}

export function aiFailure(scope: string, error: unknown) {
  const ref = logIncident(scope, error);
  const kind = error instanceof LlmError ? error.kind : error instanceof SyntaxError ? "unreadable" : "upstream";
  return { kind, ref, message: `${AI_MESSAGES[kind]} (ref ${ref})` };
}

export function serverError(scope: string, error: unknown, message: string, status = 500) {
  const ref = logIncident(scope, error);
  return Response.json({ error: `${message} (ref ${ref})` }, { status });
}
