import { after } from "next/server";
import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { dispatchRecentPush } from "@/lib/push";
import { uuid } from "@/lib/validation";
import type { FriendRequestItem, FriendRequests, SendRequestStatus } from "@/components/friends/types";

/** GET /api/friends/requests — pending incoming + outgoing requests with profiles and mutual counts. */
export const GET = handler({}, async ({ supabase }): Promise<FriendRequests> => {
  const rows = (unwrap(await supabase.rpc("my_friend_requests")) ?? []) as FriendRequestItem[];
  const items = rows.map((r) => ({ ...r, mutual_count: Number(r.mutual_count) }));
  return {
    incoming: items.filter((r) => r.direction === "incoming"),
    outgoing: items.filter((r) => r.direction === "outgoing"),
  };
});

/**
 * POST /api/friends/requests {userId} — send a request. Idempotent: returns
 * "pending" if already sent, "accepted" if they had already asked you,
 * "already_friends" if you're friends.
 */
export const POST = handler(
  { body: z.object({ userId: uuid }), rateLimit: { name: "friends.request", limit: 30, window: 60 } },
  async ({ supabase, body }) => {
    const status = unwrap(await supabase.rpc("send_friend_request", { p_target: body.userId })) as SendRequestStatus;
    if (status === "sent" || status === "accepted") after(() => dispatchRecentPush());
    return { status };
  },
);
