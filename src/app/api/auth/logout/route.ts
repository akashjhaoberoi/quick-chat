import { recordSecurityEvent } from "../_lib/security";
import { handler } from "@/lib/api/handler";

/**
 * POST /api/auth/logout — records the sign-out in login activity. The browser
 * then calls supabase.auth.signOut(), which revokes the refresh token.
 * Works without a valid session (nothing is recorded then). → { recorded }
 */
export const POST = handler(
  { auth: "optional", allowDuringMaintenance: true, rateLimit: { name: "auth.logout", limit: 20, window: 60 } },
  async ({ user, ip, userAgent }) => {
    if (!user) return { recorded: false };
    await recordSecurityEvent({ userId: user.id, sessionId: user.sessionId, event: "logout", ip, userAgent });
    return { recorded: true };
  },
);
