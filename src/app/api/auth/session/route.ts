import { loginGate, recordLoginActivity } from "../_lib/security";
import { handler } from "@/lib/api/handler";
import { after } from "next/server";
import { dispatchRecentPush } from "@/lib/push";

/**
 * POST /api/auth/session — called by the browser right after a successful sign-in.
 * Answers with what decides the next screen (status, onboarding; reactivates a
 * deactivated account), then records login activity and "new device" alerts
 * after the response so sign-in isn't held up by them.
 * → { status, onboarded, reactivated, newDevice: false }
 */
export const POST = handler(
  { allowDuringMaintenance: true, rateLimit: { name: "auth.session", limit: 20, window: 60 } },
  async ({ supabase, user, ip, userAgent }) => {
    const login = { id: user.id, email: user.email, sessionId: user.sessionId };
    const gate = await loginGate(supabase, login, { ip, userAgent });
    after(async () => {
      if (await recordLoginActivity(supabase, login, { ip, userAgent })) await dispatchRecentPush();
    });
    return { ...gate, newDevice: false };
  },
);
