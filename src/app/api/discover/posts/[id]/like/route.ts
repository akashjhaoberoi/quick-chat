import { after } from "next/server";
import { handler, unwrap } from "@/lib/api/handler";
import { dispatchRecentPush } from "@/lib/push";
import { uuid } from "@/lib/validation";

/** Toggles a like; returns the new state. Notifies the author on like. */
export const POST = handler({ rateLimit: { name: "discover.like", limit: 60, window: 60 } }, async ({ supabase, params }) => {
  const id = uuid.parse(params.id);
  const liked = unwrap(await supabase.rpc("toggle_post_like", { p_post_id: id })) as boolean;
  if (liked) after(() => dispatchRecentPush());
  return { liked };
});
