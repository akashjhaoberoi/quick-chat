import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import type { FeedPost } from "@/types/models";
import { DISCOVER_PAGE_SIZE, normalizeTag, TAG_PATTERN } from "@/components/discover/types";

/** Ranked Discover feed (rpc discover_feed): for_you | following | trending, optionally filtered by hashtag. */
export const GET = handler(
  {
    query: z.object({
      mode: z.enum(["for_you", "following", "trending"]).default("for_you"),
      offset: z.coerce.number().int().min(0).max(5000).default(0),
      tag: z
        .string()
        .max(41)
        .transform(normalizeTag)
        .refine((t) => t === "" || TAG_PATTERN.test(t), "Invalid hashtag")
        .optional(),
    }),
    rateLimit: { name: "discover.feed", limit: 120, window: 60 },
  },
  async ({ supabase, query }) => {
    const items = (unwrap(
      await supabase.rpc("discover_feed", {
        p_mode: query.mode,
        p_limit: DISCOVER_PAGE_SIZE,
        p_offset: query.offset,
        p_hashtag: query.tag ? query.tag : null,
      }),
    ) ?? []) as FeedPost[];
    return {
      items,
      nextOffset: items.length === DISCOVER_PAGE_SIZE ? query.offset + DISCOVER_PAGE_SIZE : null,
    };
  },
);
