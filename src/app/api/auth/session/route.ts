import { recordLogin } from "../_lib/security";
import { handler } from "@/lib/api/handler";
import { after } from "next/server";
import { dispatchRecentPush } from "@/lib/push";

/**
 * POST /api/auth/session — called by the browser right after a successful sign-in.
 * Records login activity (once per auth session), reactivates a deactivated
 * account and raises "new device" alerts.
 * → { status, onboarded, reactivated, newDevice }
 */
export const POST = handler(
  { allowDuringMaintenance: true, rateLimit: { name: "auth.session", limit: 20, window: 60 } },
  async ({ supabase, user, ip, userAgent }) => {
    const result = await recordLogin(supabase, { id: user.id, email: user.email, sessionId: user.sessionId }, { ip, userAgent });
    if (result.newDevice) after(() => dispatchRecentPush());
    return result;
  },
);
