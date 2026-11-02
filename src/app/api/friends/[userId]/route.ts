import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** DELETE /api/friends/{userId} — unfriend (also ends the streak and list memberships). */
export const DELETE = handler(
  { rateLimit: { name: "friends.remove", limit: 30, window: 60 } },
  async ({ supabase, params }) => {
    const userId = uuid.parse(params.userId);
    unwrap(await supabase.rpc("remove_friend", { p_other: userId }));
    return { removed: true };
  },
);
