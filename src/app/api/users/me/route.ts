import { handler, unwrap } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";

/** GET /api/users/me → { user: {id, email, aal}, profile, settings, adminRole } */
export const GET = handler({}, async ({ supabase, user }) => {
  const [profile, settings, role] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("admin_roles").select("role").eq("user_id", user.id).maybeSingle(),
  ]);
  const p = unwrap(profile);
  if (!p) throw new ApiError(404, "user_not_found", "Profile not found.");
  return {
    user: { id: user.id, email: user.email, aal: user.aal },
    profile: p,
    settings: unwrap(settings),
    adminRole: (role.data?.role as string | undefined) ?? null,
  };
});
