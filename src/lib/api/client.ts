"use client";

import type { ApiResult } from "@/types/models";

/** Error thrown by the browser API client; mirrors the server's error envelope. */
export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

async function request<T>(method: Method, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    });
  } catch {
    throw new ClientApiError(0, "network_error", "You appear to be offline. Check your connection and try again.");
  }
  let payload: ApiResult<T> | null = null;
  try {
    payload = (await res.json()) as ApiResult<T>;
  } catch {
    // Non-JSON response (e.g. platform error page).
  }
  if (!payload) throw new ClientApiError(res.status, "bad_response", `Unexpected response (${res.status}).`);
  if (!payload.ok) throw new ClientApiError(res.status, payload.error.code, payload.error.message, payload.error.details);
  return payload.data;
}

function withQuery(path: string, query?: Record<string, string | number | boolean | null | undefined>) {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const api = {
  get: <T>(path: string, query?: Record<string, string | number | boolean | null | undefined>, init?: RequestInit) =>
    request<T>("GET", withQuery(path, query), undefined, init),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", path, body),
};

export function errorMessage(error: unknown): string {
  if (error instanceof ClientApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
