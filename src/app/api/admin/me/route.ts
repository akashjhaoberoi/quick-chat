import { handler } from "@/lib/api/handler";
import { serverEnv } from "@/lib/env";
import { hasServiceRole } from "@/lib/supabase/admin";

/** GET /api/admin/me — the caller's admin role and MFA level (any admin role). */
export const GET = handler({ auth: { admin: "moderator" } }, async ({ user, adminRole }) => {
  return {
    userId: user.id,
    role: adminRole,
    aal: user.aal,
    mfaEnforced: serverEnv().ADMIN_REQUIRE_MFA,
    serviceRole: hasServiceRole(),
  };
});
