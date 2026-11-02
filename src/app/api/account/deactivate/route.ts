import { recordSecurityEvent } from "../../auth/_lib/security";
import { handler, unwrap } from "@/lib/api/handler";

/**
 * POST /api/account/deactivate — hides the account everywhere and signs out
 * every device. Signing in again reactivates it. → { deactivated: true }
 */
export const POST = handler(
  { rateLimit: { name: "account.deactivate", limit: 5, window: 3600 } },
  async ({ supabase, user, ip, userAgent }) => {
    unwrap(await supabase.rpc("set_account_active", { p_active: false }));
    await recordSecurityEvent({ userId: user.id, sessionId: user.sessionId, event: "account_deactivated", ip, userAgent });
    // Sign out every device: a deactivated account should not stay signed in anywhere.
    await supabase.auth.signOut({ scope: "global" });
    return { deactivated: true };
  },
);
