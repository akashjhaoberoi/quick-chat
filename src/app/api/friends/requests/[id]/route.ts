import { after } from "next/server";
import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { dispatchRecentPush } from "@/lib/push";
import { uuid } from "@/lib/validation";

/** POST /api/friends/requests/{id} {action} — accept or reject an incoming request. */
export const POST = handler(
  { body: z.object({ action: z.enum(["accept", "reject"]) }), rateLimit: { name: "friends.request", limit: 30, window: 60 } },
  async ({ supabase, body, params }) => {
    const id = uuid.parse(params.id);
    const status = unwrap(
      await supabase.rpc("respond_friend_request", { p_request_id: id, p_accept: body.action === "accept" }),
    ) as "accepted" | "rejected";
    if (status === "accepted") after(() => dispatchRecentPush());
    return { status };
  },
);

/** DELETE /api/friends/requests/{id} — cancel a request you sent. */
export const DELETE = handler(
  { rateLimit: { name: "friends.request", limit: 30, window: 60 } },
  async ({ supabase, params }) => {
    const id = uuid.parse(params.id);
    unwrap(await supabase.rpc("cancel_friend_request", { p_request_id: id }));
    return { status: "cancelled" as const };
  },
);
