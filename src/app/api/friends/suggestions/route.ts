import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import type { FriendSuggestion } from "@/components/friends/types";

/** GET /api/friends/suggestions?limit= — people you may know (friends of friends first). */
export const GET = handler(
  { query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }) },
  async ({ supabase, query }) => {
    const rows = (unwrap(await supabase.rpc("friend_suggestions", { p_limit: query.limit })) ?? []) as FriendSuggestion[];
    return rows.map((r) => ({ ...r, mutual_count: Number(r.mutual_count) }));
  },
);
