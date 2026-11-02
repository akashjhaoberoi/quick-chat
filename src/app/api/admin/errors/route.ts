import { handler, unwrap } from "@/lib/api/handler";

/** GET /api/admin/errors — the 100 most recent recorded server errors (admin+). */
export const GET = handler({ auth: { admin: "admin" } }, async ({ supabase }) => {
  return (
    unwrap(
      await supabase
        .from("app_errors")
        .select("id, source, message, context, user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ) ?? []
  );
});
