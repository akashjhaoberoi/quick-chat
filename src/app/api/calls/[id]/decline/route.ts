import { after } from "next/server";
import { handler, unwrap } from "@/lib/api/handler";
import { closeRoom } from "@/lib/livekit";
import { dispatchRecentPush } from "@/lib/push";
import { uuid } from "@/lib/validation";
import type { Call } from "@/types/models";
import { isLiveCall } from "@/components/calls/types";

/** Declines a ringing call. Ends the call when nobody else is still being rung. */
export const POST = handler({ rateLimit: { name: "calls.decline", limit: 30, window: 60 } }, async ({ supabase, params }) => {
  const id = uuid.parse(params.id);
  unwrap(await supabase.rpc("decline_call", { p_call_id: id }));
  const call = unwrap(await supabase.from("calls").select("*").eq("id", id).maybeSingle()) as Call | null;
  if (call && !isLiveCall(call.status)) {
    after(() => closeRoom(call.room_name));
  }
  after(() => dispatchRecentPush());
  return call;
});
