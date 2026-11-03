import { recordSecurityEvent } from "../_lib/security";
import { handler } from "@/lib/api/handler";

/**
 * POST /api/auth/logout — records the sign-out in login activity, then signs
 * this session out server-side: the refresh token is revoked and the auth
 * cookies are cleared on the response. Other devices stay signed in.
 * Works without a valid session (nothing is recorded then). → { recorded }
 */
export const POST = handler(
  { auth: "optional", allowDuringMaintenance: true, rateLimit: { name: "auth.logout", limit: 20, window: 60 } },
  async ({ user, ip, userAgent, supabase }) => {
    if (user) await recordSecurityEvent({ userId: user.id, sessionId: user.sessionId, event: "logout", ip, userAgent });
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return { recorded: Boolean(user) };
  },
);
