import { after } from "next/server";
import { z } from "zod";
import { EVENT_LABELS, recordSecurityEvent, securityAlertsEnabled, securityNotification, sendSecurityEmail } from "../_lib/security";
import { handler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { dispatchRecentPush } from "@/lib/push";

const body = z.object({
  event: z.enum(["mfa_enabled", "mfa_disabled", "password_changed", "password_reset", "session_revoked", "email_changed"]),
});

/** Events that also trigger an e-mail + in-app security notification. */
const SENSITIVE = new Set(["mfa_enabled", "mfa_disabled", "password_changed", "password_reset", "email_changed"]);

/**
 * POST /api/auth/security-event {event} — records security changes made
 * client-side through Supabase Auth (MFA, password, e-mail, session revocation).
 * "mfa_enabled" is verified against the user's actual factors before recording.
 * → { recorded: true }
 */
export const POST = handler(
  { body, allowDuringMaintenance: true, rateLimit: { name: "auth.security_event", limit: 20, window: 300 } },
  async ({ supabase, user, body, ip, userAgent }) => {
    if (body.event === "mfa_enabled") {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw new ApiError(401, "not_authenticated", "Please sign in again.");
      if (!data.all.some((f) => f.status === "verified")) {
        throw new ApiError(400, "mfa_not_enabled", "No verified authenticator found.");
      }
    }

    await recordSecurityEvent({ userId: user.id, sessionId: user.sessionId, event: body.event, ip, userAgent });

    if (SENSITIVE.has(body.event)) {
      await securityNotification(
        user.id,
        EVENT_LABELS[body.event],
        "If you didn't make this change, reset your password and sign out of other devices immediately.",
      );
      const emailAllowed = await securityAlertsEnabled(supabase, user.id);
      after(async () => {
        if (emailAllowed) await sendSecurityEmail(user.email, body.event, { ip, userAgent });
        await dispatchRecentPush();
      });
    }
    return { recorded: true };
  },
);
