import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z, ZodError, type ZodType } from "zod";
import { isSupabaseConfigured, publicEnv, serverEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { log, recordError } from "@/lib/log";
import { ApiError, fromDbError, messageFor } from "./errors";

export type AdminRole = "moderator" | "admin" | "super_admin";
type AuthMode = "user" | "optional" | "none" | "cron" | { admin: AdminRole };

export type AuthUser = { id: string; email: string | null; aal: string | null; sessionId: string | null };

export type HandlerContext<B, Q> = {
  req: NextRequest;
  user: AuthUser;
  supabase: SupabaseClient;
  body: B;
  query: Q;
  params: Record<string, string>;
  ip: string;
  userAgent: string;
  adminRole: AdminRole | null;
};

type Config<B extends ZodType | undefined, Q extends ZodType | undefined> = {
  auth?: AuthMode;
  body?: B;
  query?: Q;
  /** e.g. { name: "messages.send", limit: 30, window: 10 } — per user (or IP when anonymous). */
  rateLimit?: { name: string; limit: number; window: number };
  /** Allow mutating requests while maintenance mode is on (auth flows, admin). */
  allowDuringMaintenance?: boolean;
  /** Max JSON body size in bytes (default 256 KB). */
  maxBodyBytes?: number;
};

type Infer<T> = T extends ZodType ? z.infer<T> : undefined;

const ROLE_RANK: Record<AdminRole, number> = { moderator: 1, admin: 2, super_admin: 3 };
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function errorResponse(error: ApiError) {
  return NextResponse.json(
    { ok: false, error: { code: error.code, message: error.message, details: error.details ?? undefined } },
    {
      status: error.status,
      headers: error.status === 429 ? { "Retry-After": String((error.details as { retryAfter?: number })?.retryAfter ?? 30) } : undefined,
    },
  );
}

/** Throws an ApiError for a failed Supabase call, otherwise returns the data. */
export function unwrap<T>(result: { data: T; error: { code?: string; message?: string } | null }): T {
  if (result.error) throw fromDbError(result.error);
  return result.data;
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const fetchSite = req.headers.get("sec-fetch-site");
  if (origin) {
    const allowed = new Set([new URL(publicEnv.NEXT_PUBLIC_APP_URL).origin, req.nextUrl.origin]);
    if (!allowed.has(origin)) throw new ApiError(403, "invalid_origin", "Cross-site request blocked.");
    return;
  }
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new ApiError(403, "invalid_origin", "Cross-site request blocked.");
  }
}

let maintenanceCache: { enabled: boolean; message: string; at: number } | null = null;

async function maintenanceState(supabase: SupabaseClient) {
  if (maintenanceCache && Date.now() - maintenanceCache.at < 30_000) return maintenanceCache;
  const { data } = await supabase.from("app_settings").select("value").eq("key", "maintenance_mode").maybeSingle();
  const value = (data?.value ?? {}) as { enabled?: boolean; message?: string };
  maintenanceCache = { enabled: Boolean(value.enabled), message: value.message ?? "", at: Date.now() };
  return maintenanceCache;
}

async function readBody(req: NextRequest, maxBytes: number): Promise<unknown> {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > maxBytes) throw new ApiError(413, "payload_too_large", "Request body is too large.");
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, "payload_too_large", "Request body is too large.");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

function zodDetails(error: ZodError) {
  return error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

/**
 * Wraps a route handler with authentication, authorization, CSRF protection,
 * maintenance mode, rate limiting, validation and consistent JSON responses.
 */
export function handler<B extends ZodType | undefined = undefined, Q extends ZodType | undefined = undefined>(
  config: Config<B, Q>,
  fn: (ctx: HandlerContext<Infer<B>, Infer<Q>>) => Promise<unknown>,
) {
  const auth = config.auth ?? "user";

  return async (req: NextRequest, segment?: { params?: Promise<Record<string, string | string[]>> }) => {
    const started = Date.now();
    const ip = clientIp(req);
    let userId: string | undefined;
    try {
      const rawParams = (await segment?.params) ?? {};
      const params = Object.fromEntries(Object.entries(rawParams).map(([k, v]) => [k, Array.isArray(v) ? v.join("/") : v]));

      if (auth === "cron") {
        const secret = serverEnv().CRON_SECRET;
        if (!secret) throw new ApiError(503, "not_configured", "CRON_SECRET is not configured.");
        if (req.headers.get("authorization") !== `Bearer ${secret}`) throw new ApiError(401, "unauthorized", "Invalid cron secret.");
      } else if (MUTATING.has(req.method)) {
        assertSameOrigin(req);
      }

      if (!isSupabaseConfigured && auth !== "none") {
        throw new ApiError(503, "not_configured", "Supabase is not configured. See /setup.");
      }

      const supabase = auth === "none" && !isSupabaseConfigured ? (null as unknown as SupabaseClient) : await createSupabaseServerClient();
      let user: AuthUser | null = null;
      let adminRole: AdminRole | null = null;

      if (auth !== "none" && auth !== "cron") {
        const { data } = await supabase.auth.getClaims();
        const claims = data?.claims as { sub?: string; email?: string; aal?: string; session_id?: string } | undefined;
        if (claims?.sub) {
          user = { id: claims.sub, email: claims.email ?? null, aal: claims.aal ?? null, sessionId: claims.session_id ?? null };
          userId = user.id;
        }
        if (!user && auth !== "optional") throw new ApiError(401, "not_authenticated", messageFor("not_authenticated"));
      }

      if (user && typeof auth === "object") {
        const { data } = await supabase.from("admin_roles").select("role").eq("user_id", user.id).maybeSingle();
        adminRole = (data?.role as AdminRole | undefined) ?? null;
        if (!adminRole || ROLE_RANK[adminRole] < ROLE_RANK[auth.admin]) throw new ApiError(403, "forbidden", messageFor("forbidden"));
        if (serverEnv().ADMIN_REQUIRE_MFA && user.aal !== "aal2") {
          throw new ApiError(403, "mfa_required", "Administrators must verify with two-factor authentication.");
        }
      }

      if (MUTATING.has(req.method) && !config.allowDuringMaintenance && typeof auth !== "object" && auth !== "cron" && supabase) {
        const m = await maintenanceState(supabase);
        if (m.enabled) {
          const { data } = user ? await supabase.from("admin_roles").select("role").eq("user_id", user.id).maybeSingle() : { data: null };
          if (!data) throw new ApiError(503, "maintenance", m.message || messageFor("maintenance"));
        }
      }

      if (config.rateLimit) {
        const rl = await rateLimit(`${config.rateLimit.name}:${user?.id ?? ip}`, config.rateLimit.limit, config.rateLimit.window);
        if (!rl.ok) throw new ApiError(429, "rate_limited", messageFor("rate_limited"), { retryAfter: rl.resetSeconds });
      }

      let body: unknown = undefined;
      if (config.body) {
        body = config.body.parse(await readBody(req, config.maxBodyBytes ?? 256 * 1024));
      }
      let query: unknown = undefined;
      if (config.query) {
        query = config.query.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
      }

      const result = await fn({
        req,
        user: user as AuthUser,
        supabase,
        body: body as Infer<B>,
        query: query as Infer<Q>,
        params,
        ip,
        userAgent: req.headers.get("user-agent") ?? "",
        adminRole,
      });
      const response = result instanceof Response ? result : json(result ?? null);
      log("info", "api", { method: req.method, path: req.nextUrl.pathname, status: response.status, ms: Date.now() - started });
      return response;
    } catch (error) {
      let apiError: ApiError;
      if (error instanceof ApiError) apiError = error;
      else if (error instanceof ZodError) apiError = new ApiError(422, "validation_failed", "Please check the highlighted fields.", zodDetails(error));
      else {
        apiError = new ApiError(500, "internal_error", "Something went wrong. Please try again.");
        await recordError(`${req.method} ${req.nextUrl.pathname}`, error, {}, userId);
      }
      log(apiError.status >= 500 ? "error" : "info", "api", {
        method: req.method, path: req.nextUrl.pathname, status: apiError.status, code: apiError.code, ms: Date.now() - started,
      });
      return errorResponse(apiError);
    }
  };
}

/** Throws 503 when an optional integration is missing. */
export function requireIntegration(enabled: boolean, name: string): void {
  if (!enabled) throw new ApiError(503, "not_configured", `${name} is not configured on this server.`);
}
