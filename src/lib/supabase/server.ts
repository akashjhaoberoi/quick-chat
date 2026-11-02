import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { REMEMBER_COOKIE, sessionCookieOptions } from "./cookies";

/**
 * Supabase client bound to the current request's user session.
 * Queries run as the user, so RLS applies.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured");
  }
  const cookieStore = await cookies();
  const remember = cookieStore.get(REMEMBER_COOKIE)?.value !== "0";
  return createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL!, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: sessionCookieOptions(remember),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component; the proxy refreshes sessions instead.
        }
      },
    },
  });
}
