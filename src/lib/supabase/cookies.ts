import type { CookieOptionsWithName } from "@supabase/ssr";

/** Set to "0" when the user unticks "Remember me" at sign-in. */
export const REMEMBER_COOKIE = "qc_remember";

/**
 * Auth cookie options. Without "remember me" the auth cookies become
 * browser-session cookies (no Max-Age), so closing the browser signs out.
 */
export function sessionCookieOptions(remember: boolean): CookieOptionsWithName {
  const secure = process.env.NODE_ENV === "production";
  return remember
    ? { path: "/", sameSite: "lax", secure, maxAge: 60 * 60 * 24 * 30 }
    : { path: "/", sameSite: "lax", secure, maxAge: undefined };
}
