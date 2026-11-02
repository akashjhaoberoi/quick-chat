import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/**
 * POST /api/streaks/:friendId/recover — restore a lost streak (3+ days, lost
 * within the last 48 h, at most once every 30 days). The RPC enforces the rules.
 */
export const POST = handler({ rateLimit: { name: "streaks.recover", limit: 5, window: 3600 } }, async ({ supabase, params }) => {
  const friendId = uuid.parse(params.friendId);
  const count = unwrap(await supabase.rpc("recover_streak", { p_other: friendId })) as number;
  return { count };
});
