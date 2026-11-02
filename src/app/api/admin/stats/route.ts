import { handler, unwrap } from "@/lib/api/handler";

/** GET /api/admin/stats — dashboard counters and daily series (rpc admin_stats). */
export const GET = handler({ auth: { admin: "moderator" } }, async ({ supabase }) => {
  return unwrap(await supabase.rpc("admin_stats"));
});
