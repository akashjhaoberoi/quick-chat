import { handler, unwrap } from "@/lib/api/handler";
import type { BlockedUser } from "@/components/friends/types";

/** GET /api/users/blocked — people you've blocked. */
export const GET = handler({}, async ({ supabase }) => {
  return (unwrap(await supabase.rpc("my_blocked_users")) ?? []) as BlockedUser[];
});
