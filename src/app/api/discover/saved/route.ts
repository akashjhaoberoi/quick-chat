import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { DISCOVER_PAGE_SIZE } from "@/components/discover/types";
import { hydratePosts, POST_COLUMNS, type PostRow } from "../_lib/hydrate";

/** The viewer's saved posts, most recently saved first. */
export const GET = handler(
  { query: z.object({ offset: z.coerce.number().int().min(0).max(5000).default(0) }) },
  async ({ supabase, user, query }) => {
    const saved = (unwrap(
      await supabase
        .from("saved_posts")
        .select("post_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .range(query.offset, query.offset + DISCOVER_PAGE_SIZE - 1),
    ) ?? []) as { post_id: string; created_at: string }[];
    if (saved.length === 0) return { items: [], nextOffset: null };

    const rows = (unwrap(await supabase.from("posts").select(POST_COLUMNS).in("id", saved.map((s) => s.post_id))) ?? []) as PostRow[];
    const posts = await hydratePosts(supabase, user.id, rows);
    const byId = new Map(posts.map((p) => [p.id, p]));
    const items = saved.map((s) => byId.get(s.post_id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
    return {
      items,
      nextOffset: saved.length === DISCOVER_PAGE_SIZE ? query.offset + DISCOVER_PAGE_SIZE : null,
    };
  },
);
