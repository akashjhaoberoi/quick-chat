import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import type { AppNotification, UserCard } from "@/types/models";
import type { NotificationsPage } from "@/components/notifications/types";

const PAGE = 30;

/** GET /api/notifications?cursor=&unread= — newest first, cursor = created_at of the last item. */
export const GET = handler(
  {
    query: z.object({
      cursor: z.string().datetime({ offset: true }).optional(),
      unread: z
        .enum(["1", "0", "true", "false"])
        .optional()
        .transform((v) => v === "1" || v === "true"),
      limit: z.coerce.number().int().min(1).max(50).default(PAGE),
    }),
  },
  async ({ supabase, user, query }): Promise<NotificationsPage> => {
    let q = supabase
      .from("notifications")
      .select("id, user_id, type, actor_id, title, body, data, entity_type, entity_id, count, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(query.limit + 1);
    if (query.cursor) q = q.lt("created_at", query.cursor);
    if (query.unread) q = q.is("read_at", null);
    const rows = (unwrap(await q) ?? []) as AppNotification[];
    const items = rows.slice(0, query.limit);
    const nextCursor = rows.length > query.limit ? items[items.length - 1].created_at : null;

    const actorIds = Array.from(new Set(items.map((n) => n.actor_id).filter((x): x is string => Boolean(x))));
    const actors: Record<string, UserCard> = {};
    if (actorIds.length) {
      // RLS only returns active profiles that aren't blocked either way.
      const cards = (unwrap(
        await supabase.from("profiles").select("id, username, display_name, avatar_media_id").in("id", actorIds),
      ) ?? []) as UserCard[];
      for (const c of cards) actors[c.id] = c;
    }
    return { items, actors, nextCursor };
  },
);
