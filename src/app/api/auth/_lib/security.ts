import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin";
import { sendSecurityAlert } from "@/lib/email";
import { log } from "@/lib/log";

/** Events stored in public.user_sessions (see the foundation migration). */
export type SecurityEvent =
  | "login" | "logout" | "signup" | "password_changed" | "password_reset" | "mfa_enabled" | "mfa_disabled"
  | "session_revoked" | "account_deactivated" | "account_reactivated" | "email_changed";

export const EVENT_LABELS: Record<SecurityEvent, string> = {
  login: "New sign-in",
  logout: "Signed out",
  signup: "Account created",
  password_changed: "Password changed",
  password_reset: "Password reset",
  mfa_enabled: "Two-factor authentication turned on",
  mfa_disabled: "Two-factor authentication turned off",
  session_revoked: "Signed out of other devices",
  account_deactivated: "Account deactivated",
  account_reactivated: "Account reactivated",
  email_changed: "Email address changed",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Chrome on Windows", "Safari on iPhone", … (best effort, never trusted for security decisions). */
export function deviceLabel(userAgent: string): string {
  const ua = userAgent || "";
  if (!ua) return "Unknown device";
  let os = "Unknown OS";
  if (/iPhone/i.test(ua)) os = "iPhone";
  else if (/iPad/i.test(ua)) os = "iPad";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/CrOS/i.test(ua)) os = "ChromeOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS/i.test(ua)) browser = "Firefox";
  else if (/Chrome\/|CriOS/i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua)) browser = "Safari";
  return `${browser} on ${os}`;
}

type RecordInput = {
  userId: string;
  sessionId: string | null;
  event: SecurityEvent;
  ip: string;
  userAgent: string;
};

/** Appends a row to the user's login/security activity (service role; users can only read their own). */
export async function recordSecurityEvent(input: RecordInput): Promise<void> {
  if (!hasServiceRole()) {
    log("warn", "security_event_not_recorded", { event: input.event, reason: "no_service_role" });
    return;
  }
  const { error } = await getSupabaseAdmin()
    .from("user_sessions")
    .insert({
      user_id: input.userId,
      session_id: input.sessionId && UUID_RE.test(input.sessionId) ? input.sessionId : null,
      event: input.event,
      ip: input.ip === "unknown" ? null : input.ip.slice(0, 64),
      user_agent: input.userAgent.slice(0, 500) || null,
      device: deviceLabel(input.userAgent),
    });
  if (error) log("warn", "security_event_insert_failed", { event: input.event, error: error.message });
}

/** In-app security notification (always delivered; not subject to notification preferences). */
export async function securityNotification(userId: string, title: string, body: string): Promise<void> {
  if (!hasServiceRole()) return;
  const { error } = await getSupabaseAdmin()
    .from("notifications")
    .insert({ user_id: userId, type: "security", title, body: body.slice(0, 280), data: { url: "/settings/security" } });
  if (error) log("warn", "security_notification_failed", { error: error.message });
}

/** Whether the user wants security e-mails (defaults to on). */
export async function securityAlertsEnabled(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from("user_settings").select("email_security_alerts").eq("user_id", userId).maybeSingle();
  return !(data && data.email_security_alerts === false);
}

/** Sends a security e-mail (no-op when Resend isn't configured). */
export async function sendSecurityEmail(email: string | null, event: SecurityEvent, details: { ip: string; userAgent: string }): Promise<void> {
  if (!email) return;
  await sendSecurityAlert(email, EVENT_LABELS[event], {
    device: deviceLabel(details.userAgent),
    ip: details.ip === "unknown" ? undefined : details.ip,
  });
}

/** Sends a security e-mail when the user has security alerts enabled. */
export async function securityEmail(
  supabase: SupabaseClient,
  userId: string,
  email: string | null,
  event: SecurityEvent,
  details: { ip: string; userAgent: string },
): Promise<void> {
  if (!email) return;
  if (!(await securityAlertsEnabled(supabase, userId))) return;
  await sendSecurityEmail(email, event, details);
}

/**
 * Whether this device (by user agent) has signed in to the account before.
 * Used to decide whether a sign-in deserves a "new device" alert.
 */
export async function isKnownDevice(userId: string, userAgent: string): Promise<{ known: boolean; firstLogin: boolean }> {
  if (!hasServiceRole()) return { known: true, firstLogin: false };
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("user_sessions")
    .select("user_agent, device")
    .eq("user_id", userId)
    .eq("event", "login")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  if (rows.length === 0) return { known: false, firstLogin: true };
  const ua = userAgent.slice(0, 500);
  return { known: rows.some((r) => r.user_agent === ua), firstLogin: false };
}

/**
 * Records a sign-in (idempotent per session), reactivates a deactivated
 * account and raises "new device" alerts. Shared by POST /api/auth/session
 * and the OAuth / e-mail confirmation callbacks.
 */
export async function recordLogin(
  supabase: SupabaseClient,
  user: { id: string; email: string | null; sessionId: string | null },
  request: { ip: string; userAgent: string },
): Promise<{ status: string; onboarded: boolean; reactivated: boolean; newDevice: boolean }> {
  const { data: profile } = await supabase.from("profiles").select("status, onboarded").eq("id", user.id).maybeSingle();
  let status = (profile?.status as string | undefined) ?? "active";
  const onboarded = Boolean(profile?.onboarded);

  let reactivated = false;
  if (status === "deactivated") {
    const { error } = await supabase.rpc("set_account_active", { p_active: true });
    if (!error) {
      reactivated = true;
      status = "active";
      await recordSecurityEvent({ userId: user.id, sessionId: user.sessionId, event: "account_reactivated", ...request });
    }
  }

  // One 'login' row per auth session (the client may call this more than once, e.g. after MFA).
  if (user.sessionId && hasServiceRole()) {
    const { data: existing } = await getSupabaseAdmin()
      .from("user_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("session_id", user.sessionId)
      .eq("event", "login")
      .limit(1);
    if (existing && existing.length > 0) return { status, onboarded, reactivated, newDevice: false };
  }

  const device = await isKnownDevice(user.id, request.userAgent);
  await recordSecurityEvent({ userId: user.id, sessionId: user.sessionId, event: "login", ...request });

  const newDevice = !device.known && !device.firstLogin;
  if (newDevice) {
    const label = deviceLabel(request.userAgent);
    await securityNotification(user.id, "New sign-in to your account", `Signed in from ${label}. If this wasn't you, change your password now.`);
    await securityEmail(supabase, user.id, user.email, "login", request);
  }
  return { status, onboarded, reactivated, newDevice };
}

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeNextPath(raw: string | null | undefined, fallback = "/home"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
