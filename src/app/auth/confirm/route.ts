import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { recordLogin, recordSecurityEvent, safeNextPath, securityNotification } from "@/app/api/auth/_lib/security";
import { clientIp } from "@/lib/api/handler";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["signup", "email", "email_change", "recovery", "magiclink", "invite"];

/**
 * Target of e-mail links (sign-up confirmation, e-mail change, password
 * recovery). Verifies the token hash, which creates a session cookie, then
 * continues to `next`.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type") ?? "";
  const type = TYPES.find((t) => t === rawType);
  const defaultNext = type === "recovery" ? "/reset-password" : type === "email_change" ? "/settings/account" : "/onboarding";
  const next = safeNextPath(url.searchParams.get("next"), defaultNext);

  if (!isSupabaseConfigured) return NextResponse.redirect(new URL("/setup", url.origin));

  const fail = (reason: string) => {
    const target = new URL(type === "recovery" ? "/forgot-password" : "/login", url.origin);
    target.searchParams.set("error", reason);
    return NextResponse.redirect(target);
  };

  if (!tokenHash || !type) return fail("This link is invalid. Please request a new one.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return fail(/expired|invalid/i.test(error.message) ? "This link has expired or was already used. Please request a new one." : "We couldn't verify this link.");
  }

  const user = data.user ?? data.session?.user;
  if (user && data.session) {
    const { data: claimsData } = await supabase.auth.getClaims();
    const sessionId = (claimsData?.claims as { session_id?: string } | undefined)?.session_id ?? null;
    const req = { ip: clientIp(request), userAgent: request.headers.get("user-agent") ?? "" };
    try {
      if (type === "email_change") {
        await recordSecurityEvent({ userId: user.id, sessionId, event: "email_changed", ...req });
        await securityNotification(user.id, "Email address changed", `Your sign-in email is now ${user.email ?? "updated"}.`);
      } else if (type !== "recovery") {
        await recordLogin(supabase, { id: user.id, email: user.email ?? null, sessionId }, req);
      }
    } catch {
      // Activity logging is best effort; never block the user on it.
    }
  }

  const target = new URL(next, url.origin);
  if (type === "email_change") target.searchParams.set("email", "updated");
  return NextResponse.redirect(target);
}
