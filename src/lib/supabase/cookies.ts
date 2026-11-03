import type { CookieOptions, CookieOptionsWithName } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";

/** Set to "0" when the user unticks "Remember me" at sign-in. */
export const REMEMBER_COOKIE = "qc_remember";

const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Base auth cookie options: path /, SameSite=Lax, Secure whenever the app is
 * served over HTTPS. (Keyed on the app URL rather than NODE_ENV: Safari drops
 * Secure cookies on http://localhost, which broke `next start` there.)
 */
export function sessionCookieOptions(remember: boolean): CookieOptionsWithName {
  const secure = publicEnv.NEXT_PUBLIC_APP_URL.startsWith("https://");
  return { path: "/", sameSite: "lax", secure, maxAge: remember ? REMEMBER_MAX_AGE : undefined };
}

/**
 * @supabase/ssr always writes auth cookies with its own 400-day Max-Age, so the
 * lifetime from `sessionCookieOptions` is applied here, in each client's
 * cookie writer: 30 days with "remember me", otherwise a browser-session
 * cookie (no Max-Age/Expires) so closing the browser signs out.
 * Deletions (Max-Age 0) pass through untouched.
 */
export function withLifetime(options: CookieOptions | undefined, remember: boolean): CookieOptions {
  const opts = { ...options };
  if (opts.maxAge === 0) return opts;
  delete opts.expires;
  if (remember) opts.maxAge = REMEMBER_MAX_AGE;
  else delete opts.maxAge;
  return opts;
}
