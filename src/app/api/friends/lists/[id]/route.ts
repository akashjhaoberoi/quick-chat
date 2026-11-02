import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";
import { friendListSchema, listError } from "../schema";

/** PUT /api/friends/lists/{id} {name, memberIds} — rename and replace members. */
export const PUT = handler(
  { body: friendListSchema, rateLimit: { name: "friends.lists", limit: 30, window: 60 } },
  async ({ supabase, body, params }) => {
    const id = uuid.parse(params.id);
    const { data, error } = await supabase.rpc("save_friend_list", {
      p_list_id: id,
      p_name: body.name,
      p_member_ids: body.memberIds,
    });
    if (error) throw listError(error);
    return { id: data as string };
  },
);

/** DELETE /api/friends/lists/{id} */
export const DELETE = handler(
  { rateLimit: { name: "friends.lists", limit: 30, window: 60 } },
  async ({ supabase, params }) => {
    const id = uuid.parse(params.id);
    unwrap(await supabase.rpc("delete_friend_list", { p_list_id: id }));
    return { deleted: true };
  },
);
