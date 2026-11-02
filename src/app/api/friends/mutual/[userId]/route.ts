import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";
import type { MutualFriend } from "@/components/friends/types";

/** GET /api/friends/mutual/{userId}?limit= — friends you have in common with someone. */
export const GET = handler(
  { query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }) },
  async ({ supabase, params, query }) => {
    const userId = uuid.parse(params.userId);
    return (unwrap(await supabase.rpc("mutual_friends", { p_other: userId, p_limit: query.limit })) ?? []) as MutualFriend[];
  },
);
