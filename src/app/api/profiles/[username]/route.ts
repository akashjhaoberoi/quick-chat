import { handler, unwrap } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { usernameSchema } from "@/lib/validation";

/** GET /api/profiles/{username} → ProfileSummary (privacy-filtered by the profile_summary RPC). */
export const GET = handler({ rateLimit: { name: "profiles.get", limit: 120, window: 60 } }, async ({ supabase, params }) => {
  const parsed = usernameSchema.safeParse(params.username ?? "");
  if (!parsed.success) throw new ApiError(404, "user_not_found", "That user could not be found.");
  const rows = unwrap(await supabase.rpc("profile_summary", { p_username: parsed.data })) as unknown[] | null;
  const row = rows?.[0];
  if (!row) throw new ApiError(404, "user_not_found", "That user could not be found.");
  return row;
});
