import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import type { Creator } from "@/components/discover/types";

/** Creator search (rpc search_creators). An empty query returns the most followed creators. */
export const GET = handler(
  {
    query: z.object({ q: z.string().trim().max(50).default(""), limit: z.coerce.number().int().min(1).max(50).default(20) }),
    rateLimit: { name: "discover.creators", limit: 60, window: 60 },
  },
  async ({ supabase, query }) => {
    const q = query.q.replace(/^@/, "").replace(/[%_\\]/g, "");
    const rows = (unwrap(await supabase.rpc("search_creators", { p_query: q, p_limit: query.limit })) ?? []) as (Omit<Creator, "follower_count"> & {
      follower_count: number | string;
    })[];
    return rows.map((r): Creator => ({ ...r, follower_count: Number(r.follower_count) }));
  },
);
