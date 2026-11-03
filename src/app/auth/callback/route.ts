import { after, NextResponse, type NextRequest } from "next/server";
import { loginGate, recordLoginActivity, safeNextPath } from "@/app/api/auth/_lib/security";
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
    // The same callback URL can load twice (double tap, Safari restoring a tab, a
    // prefetch). The first request already signed in, so continue instead of failing.
    const { data: existing } = await supabase.auth.getClaims();
    if (existing?.claims?.sub) return NextResponse.redirect(new URL(next, url.origin));

    const message = error?.message ?? "";
    if (/registration_closed|database error saving new user/i.test(message)) return fail("New registrations are currently closed.");
    // The PKCE verifier cookie lives on the site that started sign-in. It's missing when sign-in
    // began on another address, in another browser or app window, or cookies were blocked/cleared.
    if (error?.name === "AuthPKCECodeVerifierMissingError" || /code verifier/i.test(message)) {
      return fail("Sign-in was started in a different browser or window, or cookies are blocked. Please tap Continue with Google again here.");
    }
    return fail("We couldn't complete sign-in. Please try again.");
  }

  // Only what decides the next screen runs before the redirect (in parallel);
  // login activity and new-device alerts are recorded after the response.
  const sessionId = sessionIdOf(data.session.access_token);
  const login = { id: data.session.user.id, email: data.session.user.email ?? null, sessionId };
  const req = { ip: clientIp(request), userAgent: request.headers.get("user-agent") ?? "" };
  const [result, { data: aal }] = await Promise.all([
    loginGate(supabase, login, req).catch(() => ({ status: "active", onboarded: true, reactivated: false })),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  after(() => recordLoginActivity(supabase, login, req).catch(() => undefined));

  if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
    const target = new URL("/login/mfa", url.origin);
    target.searchParams.set("next", next);
    return NextResponse.redirect(target);
  }
  if (result.status === "suspended" || result.status === "banned") return NextResponse.redirect(new URL("/suspended", url.origin));
  if (!result.onboarded) return NextResponse.redirect(new URL("/onboarding", url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}

/** The session id claim of a token Supabase just issued to us over TLS (no need to verify it again). */
function sessionIdOf(accessToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")) as { session_id?: string };
    return payload.session_id ?? null;
  } catch {
    return null;
  }
}
