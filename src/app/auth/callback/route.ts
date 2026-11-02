import { NextResponse, type NextRequest } from "next/server";
import { recordLogin, safeNextPath } from "@/app/api/auth/_lib/security";
import { clientIp } from "@/lib/api/handler";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * OAuth (Google) redirect target: exchanges the PKCE code for a session
 * (cookies are written by the server client), records the sign-in, then
 * continues to MFA, onboarding or the requested page.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNextPath(url.searchParams.get("next"));
  const fail = (reason: string) => {
    const target = new URL("/login", url.origin);
    target.searchParams.set("error", reason);
    if (next !== "/home") target.searchParams.set("next", next);
    return NextResponse.redirect(target);
  };

  if (!isSupabaseConfigured) return NextResponse.redirect(new URL("/setup", url.origin));

  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (providerError) return fail(providerError.slice(0, 200));

  const code = url.searchParams.get("code");
  if (!code) return fail("Sign-in link is missing its code. Please try again.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    const closed = /registration_closed|database error saving new user/i.test(error?.message ?? "");
    return fail(closed ? "New registrations are currently closed." : "We couldn't complete sign-in. Please try again.");
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as { session_id?: string } | undefined;
  const result = await recordLogin(
    supabase,
    { id: data.session.user.id, email: data.session.user.email ?? null, sessionId: claims?.session_id ?? null },
    { ip: clientIp(request), userAgent: request.headers.get("user-agent") ?? "" },
  ).catch(() => ({ status: "active", onboarded: true, reactivated: false, newDevice: false }));

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
    const target = new URL("/login/mfa", url.origin);
    target.searchParams.set("next", next);
    return NextResponse.redirect(target);
  }
  if (result.status === "suspended" || result.status === "banned") return NextResponse.redirect(new URL("/suspended", url.origin));
  if (!result.onboarded) return NextResponse.redirect(new URL("/onboarding", url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
