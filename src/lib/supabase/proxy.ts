import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";
import { REMEMBER_COOKIE, sessionCookieOptions } from "./cookies";

/**
 * Refreshes the Supabase session cookie on every matched request and returns
 * the (possibly null) user id so the proxy can gate protected routes.
 */
export async function refreshSession(request: NextRequest): Promise<{ response: NextResponse; userId: string | null; aal: string | null }> {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured) {
    return { response, userId: null, aal: null };
  }
  const remember = request.cookies.get(REMEMBER_COOKIE)?.value !== "0";
  const supabase = createServerClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL!, publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: sessionCookieOptions(remember),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // getClaims() verifies the JWT (locally when asymmetric keys are enabled).
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; aal?: string } | undefined;
  return { response, userId: claims?.sub ?? null, aal: claims?.aal ?? null };
}
