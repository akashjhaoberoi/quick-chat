"use client";

import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { REMEMBER_COOKIE, sessionCookieOptions, withLifetime } from "./cookies";

let client: SupabaseClient | null = null;

function rememberPreference(): boolean {
  if (typeof document === "undefined") return true;
  return !document.cookie.split("; ").some((c) => c === `${REMEMBER_COOKIE}=0`);
}

/** Browser Supabase client (anon key + user session; RLS enforced). */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured");
  }
  if (!client) {
    client = createBrowserClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL!, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookieOptions: sessionCookieOptions(rememberPreference()),
      // Same as the library's document.cookie default, but with our cookie lifetime (see
      // withLifetime). The preference is read per write, so it applies to an existing client too.
      cookies: {
        getAll: () => parseCookieHeader(document.cookie).map(({ name, value }) => ({ name, value: value ?? "" })),
        setAll: (cookies) => {
          const remember = rememberPreference();
          for (const { name, value, options } of cookies) document.cookie = serializeCookieHeader(name, value, withLifetime(options, remember));
        },
      },
      isSingleton: true,
    });
  }
  return client;
}

/** Re-creates the client after the remember-me preference changes. */
export function resetSupabaseBrowserClient() {
  client = null;
}
