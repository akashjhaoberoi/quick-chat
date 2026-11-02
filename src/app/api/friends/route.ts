import { handler, unwrap } from "@/lib/api/handler";
import type { Friend } from "@/types/models";

/** GET /api/friends — the caller's friends (presence filtered by each friend's privacy setting). */
export const GET = handler({}, async ({ supabase }) => {
  return (unwrap(await supabase.rpc("my_friends")) ?? []) as Friend[];
});
