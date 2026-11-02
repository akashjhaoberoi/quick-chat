import { handler, unwrap } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { uuid } from "@/lib/validation";

/** DELETE /api/notifications/{id} — remove one of your notifications. */
export const DELETE = handler(
  { rateLimit: { name: "notifications.delete", limit: 120, window: 60 } },
  async ({ supabase, user, params }) => {
    const id = uuid.parse(params.id);
    const rows = unwrap(
      await supabase.from("notifications").delete().eq("id", id).eq("user_id", user.id).select("id"),
    ) as { id: string }[] | null;
    if (!rows?.length) throw new ApiError(404, "notification_not_found", "That notification no longer exists.");
    return { deleted: true };
  },
);
