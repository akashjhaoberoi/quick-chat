import { handler, unwrap } from "@/lib/api/handler";
import type { FriendList } from "@/components/friends/types";
import { friendListSchema, listError } from "./schema";

type ListRow = { id: string; name: string; created_at: string; friend_list_members: { user_id: string }[] | null };

/** GET /api/friends/lists — your custom friend lists (used for custom story audiences). */
export const GET = handler({}, async ({ supabase, user }): Promise<FriendList[]> => {
  const rows = unwrap(
    await supabase
      .from("friend_lists")
      .select("id, name, created_at, friend_list_members(user_id)")
      .eq("owner_id", user.id)
      .order("name"),
  ) as ListRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    created_at: r.created_at,
    member_ids: (r.friend_list_members ?? []).map((m) => m.user_id),
  }));
});

/** POST /api/friends/lists {name, memberIds} — create a list. Non-friends are silently dropped. */
export const POST = handler(
  { body: friendListSchema, rateLimit: { name: "friends.lists", limit: 30, window: 60 } },
  async ({ supabase, body }) => {
    const { data, error } = await supabase.rpc("save_friend_list", {
      p_list_id: null,
      p_name: body.name,
      p_member_ids: body.memberIds,
    });
    if (error) throw listError(error);
    return { id: data as string };
  },
);
