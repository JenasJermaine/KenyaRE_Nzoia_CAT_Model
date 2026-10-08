/** Fired when the server says the session is missing or expired, so the app can show the sign-in screen. */
export const AUTH_EXPIRED_EVENT = "nzoia:auth-expired";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** fetch wrapper for the app's own /api routes: returns the JSON body or throws an ApiError with a readable message. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("Could not reach the server. Check that it is running and that you are online.", 0);
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!res.ok) {
    if (res.status === 401 && body?.code === "auth_required") window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    throw new ApiError(body?.error ?? `The server could not complete the request (status ${res.status}). Try again.`, res.status, body?.code);
  }
  if (body == null) throw new ApiError("The server sent an answer the app could not read. Try again.", res.status);
  return body;
}

export const sendJson = <T>(url: string, data: unknown, method = "POST") =>
  api<T>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
