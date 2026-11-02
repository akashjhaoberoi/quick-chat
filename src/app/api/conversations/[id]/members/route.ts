import { after } from "next/server";
import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { dispatchRecentPush } from "@/lib/push";
import { uuid } from "@/lib/validation";

/** POST /api/conversations/{id}/members — add friends to a group. */
export const POST = handler(
  { body: z.object({ userIds: z.array(uuid).min(1).max(99) }), rateLimit: { name: "groups.members", limit: 30, window: 60 } },
  async ({ supabase, params, body }) => {
    const added = unwrap(
      await supabase.rpc("add_group_members", { p_conversation_id: uuid.parse(params.id), p_user_ids: body.userIds }),
    ) as number;
    after(() => dispatchRecentPush());
    return { added };
  },
);
