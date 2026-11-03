"use client";

import { api } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { publicEnv } from "@/lib/env";
import type { ThemePreference } from "@/components/providers/theme-provider";

export type SessionResult = { status: string; onboarded: boolean; reactivated: boolean; newDevice: boolean };

/** Only same-site relative paths are allowed as post-login destinations. */
export function safeNext(raw: string | null | undefined, fallback = "/home"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}

/** Public origin for e-mail links (falls back to the current origin in development). */
export function appOrigin(): string {
  const configured = publicEnv.NEXT_PUBLIC_APP_URL;
  if (typeof window === "undefined") return configured;
  // Prefer the configured URL unless it's the localhost default while running elsewhere.
  if (/^https?:\/\/localhost(:\d+)?$/.test(configured.replace(/\/$/, "")) && window.location.hostname !== "localhost") {
    return window.location.origin;
  }
  return configured.replace(/\/$/, "");
}

/**
 * Runs after any successful credential check: records the sign-in server-side,
 * applies the saved theme, and decides where to go next (MFA → suspension →
 * onboarding → `next`).
 */
export async function finishSignIn(next: string, applyTheme?: (t: ThemePreference) => void): Promise<{ target: string; session: SessionResult | null }> {
  const supabase = getSupabaseBrowserClient();
  const session = await api.post<SessionResult>("/api/auth/session").catch(() => null);

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
    return { target: `/login/mfa?next=${encodeURIComponent(next)}`, session };
  }

  if (applyTheme) {
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      const { data } = await supabase.from("user_settings").select("theme").eq("user_id", auth.user.id).maybeSingle();
      const theme = data?.theme as ThemePreference | undefined;
      if (theme === "light" || theme === "dark" || theme === "system") applyTheme(theme);
    }
  }

  if (session?.status === "suspended" || session?.status === "banned") return { target: "/suspended", session };
  if (session && !session.onboarded) return { target: "/onboarding", session };
  return { target: next, session };
}

/** Sets the "remember me" cookie before sign-in so the auth cookies get the right lifetime. */
export function setRememberPreference(remember: boolean) {
  document.cookie = `qc_remember=${remember ? 1 : 0}; path=/; max-age=31536000; samesite=lax`;
}

/** Maps Supabase Auth error messages to friendly copy. */
export function authErrorMessage(error: { message?: string; code?: string } | null | undefined, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;
  const code = error.code ?? "";
  const msg = error.message ?? "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) return "Incorrect email or password.";
  if (code === "email_not_confirmed" || /email not confirmed/i.test(msg)) return "Please confirm your email first — check your inbox for the link.";
  if (code === "user_already_exists" || /already registered/i.test(msg)) return "An account with this email already exists. Try signing in.";
  if (code === "weak_password" || /weak|pwned|leaked/i.test(msg)) return "That password is too weak or has appeared in a data breach. Choose another.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || /rate limit|too many/i.test(msg)) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (code === "same_password") return "Your new password must be different from the old one.";
  if (code === "mfa_verification_failed" || /invalid totp|invalid code/i.test(msg)) return "That code isn't right. Check your authenticator app and try again.";
  if (/registration_closed|database error saving new user/i.test(msg)) return "New registrations are currently closed.";
  if (code === "signup_disabled") return "New registrations are currently closed.";
  if (/network|fetch/i.test(msg)) return "You appear to be offline. Check your connection and try again.";
  return msg || fallback;
}

let signingOut = false;

/** True while `signOutDevice` runs, so the SIGNED_OUT listener doesn't start a second navigation. */
export function isSigningOut(): boolean {
  return signingOut;
}

/**
 * Signs this device out: the server revokes the session and clears the auth
 * cookies, the browser client drops its copy (other tabs hear SIGNED_OUT),
 * and a full navigation discards the router cache, realtime channels, calls
 * and every cached query. Other devices stay signed in.
 */
export async function signOutDevice(to = "/login"): Promise<void> {
  signingOut = true;
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
  await getSupabaseBrowserClient().auth.signOut({ scope: "local" }).catch(() => undefined);
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.replace(to);
}
