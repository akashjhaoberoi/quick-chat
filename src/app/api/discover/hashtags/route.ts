import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import type { TrendingTag } from "@/components/discover/types";

/** Most used hashtags on public posts in the last 7 days. */
export const GET = handler(
  { query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }) },
  async ({ supabase, query }) => {
    const rows = (unwrap(await supabase.rpc("trending_hashtags", { p_limit: query.limit })) ?? []) as { tag: string; post_count: number | string }[];
    return rows.map((r): TrendingTag => ({ tag: r.tag, post_count: Number(r.post_count) }));
  },
);
