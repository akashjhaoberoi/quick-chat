import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import type { ConversationSummary, UserCard } from "@/types/models";
import type { UserSearchResult } from "@/components/friends/types";
import {
  SEARCH_TYPES,
  type CreatorHit,
  type GroupHit,
  type HashtagHit,
  type MessageHit,
  type PostHit,
  type SearchAllResult,
  type SearchCategory,
  type SearchPage,
  type SearchResponse,
  type StoryHit,
} from "@/components/search/types";

const PAGE = 20;
const ALL_LIMIT = 5;
/** RPCs without an offset parameter cap their result at 50 rows. */
const MAX_WINDOW = 50;

type Ctx = { supabase: SupabaseClient; userId: string; q: string };
type AnyFetcher = (ctx: Ctx, limit: number, offset: number) => Promise<SearchPage>;

function page<T>(rows: T[], limit: number, offset: number): { items: T[]; nextOffset: number | null } {
  return { items: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null };
}

/** For RPCs that only take p_limit: fetch the window up to offset+limit+1 and slice. */
function windowed<T>(rows: T[], limit: number, offset: number) {
  const result = page(rows.slice(offset, offset + limit + 1), limit, offset);
  if (result.nextOffset !== null && result.nextOffset >= MAX_WINDOW) result.nextOffset = null;
  return result;
}

async function users({ supabase, q }: Ctx, limit: number, offset: number) {
  const rows = (unwrap(await supabase.rpc("search_users", { p_query: q, p_limit: limit + 1, p_offset: offset })) ??
    []) as UserSearchResult[];
  return page(rows, limit, offset);
}

async function groups({ supabase, q }: Ctx, limit: number, offset: number) {
  const rows = (unwrap(
    await supabase.rpc("search_groups", { p_query: q, p_limit: Math.min(offset + limit + 1, MAX_WINDOW) }),
  ) ?? []) as GroupHit[];
  return windowed(rows.map((g) => ({ ...g, member_count: Number(g.member_count) })), limit, offset);
}

async function creators({ supabase, q }: Ctx, limit: number, offset: number) {
  const rows = (unwrap(
    await supabase.rpc("search_creators", { p_query: q, p_limit: Math.min(offset + limit + 1, MAX_WINDOW) }),
  ) ?? []) as CreatorHit[];
  return windowed(rows.map((c) => ({ ...c, follower_count: Number(c.follower_count) })), limit, offset);
}

async function stories({ supabase, q }: Ctx, limit: number, offset: number) {
  const rows = (unwrap(
    await supabase.rpc("search_public_stories", { p_query: q, p_limit: Math.min(offset + limit + 1, MAX_WINDOW) }),
  ) ?? []) as StoryHit[];
  return windowed(rows, limit, offset);
}

async function posts({ supabase, q }: Ctx, limit: number, offset: number) {
  const rows = (unwrap(await supabase.rpc("search_posts", { p_query: q, p_limit: limit + 1, p_offset: offset })) ??
    []) as PostHit[];
  return page(rows, limit, offset);
}

/** Trending tags (last 7 days) matching the prefix, plus the exact tag when any post uses it. */
async function hashtags({ supabase, q }: Ctx, limit: number, offset: number) {
  const tag = q.replace(/^#+/, "").trim().toLowerCase();
  if (!tag || /\s/.test(tag)) return { items: [] as HashtagHit[], nextOffset: null };
  const [trending, exact] = await Promise.all([
    supabase.rpc("trending_hashtags", { p_limit: 50 }),
    supabase.rpc("search_posts", { p_query: `#${tag}`, p_limit: MAX_WINDOW, p_offset: 0 }),
  ]);
  const tags = ((unwrap(trending) ?? []) as { tag: string; post_count: number }[])
    .filter((t) => t.tag.startsWith(tag))
    .map<HashtagHit>((t) => ({ tag: t.tag, post_count: Number(t.post_count), capped: false }));
  const exactCount = ((unwrap(exact) ?? []) as PostHit[]).length;
  if (exactCount > 0 && !tags.some((t) => t.tag === tag)) {
    tags.push({ tag, post_count: exactCount, capped: exactCount >= MAX_WINDOW });
  }
  tags.sort((a, b) => Number(b.tag === tag) - Number(a.tag === tag) || b.post_count - a.post_count);
  return windowed(tags, limit, offset);
}

type RawMessage = { id: string; conversation_id: string; sender_id: string | null; type: string; body: string | null; created_at: string };

async function messages({ supabase, userId, q }: Ctx, limit: number, offset: number) {
  if (q.length < 2) return { items: [] as MessageHit[], nextOffset: null };
  const raw = (unwrap(
    await supabase.rpc("search_messages", { p_query: q, p_conversation_id: null, p_limit: limit + 1, p_offset: offset }),
  ) ?? []) as RawMessage[];
  const { items, nextOffset } = page(raw, limit, offset);
  if (items.length === 0) return { items: [] as MessageHit[], nextOffset: null };

  // Conversation titles: the caller's conversation list (active + archived), then direct lookups for the rest.
  const convIds = new Set(items.map((m) => m.conversation_id));
  const conv = new Map<string, { title: string; type: "direct" | "group"; avatar: string | null }>();
  const lists = await Promise.all([
    supabase.rpc("my_conversations", { p_archived: false, p_limit: 100 }),
    supabase.rpc("my_conversations", { p_archived: true, p_limit: 100 }),
  ]);
  for (const res of lists) {
    for (const c of (res.data ?? []) as ConversationSummary[]) {
      if (convIds.has(c.conversation_id)) conv.set(c.conversation_id, { title: c.title, type: c.type, avatar: c.avatar_media_id });
    }
  }
  const missing = [...convIds].filter((id) => !conv.has(id));
  if (missing.length) {
    const [groupRows, memberRows] = await Promise.all([
      supabase.from("groups").select("conversation_id, name, avatar_media_id").in("conversation_id", missing),
      supabase.from("conversation_members").select("conversation_id, user_id").in("conversation_id", missing).neq("user_id", userId),
    ]);
    for (const g of (groupRows.data ?? []) as { conversation_id: string; name: string; avatar_media_id: string | null }[]) {
      conv.set(g.conversation_id, { title: g.name, type: "group", avatar: g.avatar_media_id });
    }
    const directMembers = ((memberRows.data ?? []) as { conversation_id: string; user_id: string }[]).filter(
      (m) => !conv.has(m.conversation_id),
    );
    if (directMembers.length) {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_media_id")
        .in("id", [...new Set(directMembers.map((m) => m.user_id))]);
      const people = new Map(((data ?? []) as UserCard[]).map((p) => [p.id, p]));
      for (const m of directMembers) {
        const p = people.get(m.user_id);
        if (p && !conv.has(m.conversation_id)) {
          conv.set(m.conversation_id, { title: p.display_name || p.username, type: "direct", avatar: p.avatar_media_id });
        }
      }
    }
  }

  const senderIds = [...new Set(items.map((m) => m.sender_id).filter((x): x is string => Boolean(x) && x !== userId))];
  const senders = new Map<string, string>();
  if (senderIds.length) {
    const { data } = await supabase.from("profiles").select("id, username, display_name").in("id", senderIds);
    for (const p of (data ?? []) as { id: string; username: string; display_name: string }[]) {
      senders.set(p.id, p.display_name || p.username);
    }
  }

  const hits: MessageHit[] = items.map((m) => {
    const c = conv.get(m.conversation_id);
    return {
      ...m,
      sender_name: m.sender_id === userId ? "You" : m.sender_id ? (senders.get(m.sender_id) ?? null) : null,
      conversation_title: c?.title ?? "Chat",
      conversation_type: c?.type ?? null,
      conversation_avatar_media_id: c?.avatar ?? null,
    };
  });
  return { items: hits, nextOffset };
}

const FETCHERS: Record<SearchCategory, AnyFetcher> = {
  users: users as AnyFetcher,
  groups: groups as AnyFetcher,
  messages: messages as AnyFetcher,
  creators: creators as AnyFetcher,
  stories: stories as AnyFetcher,
  posts: posts as AnyFetcher,
  hashtags: hashtags as AnyFetcher,
};

/**
 * GET /api/search?type=all|users|groups|messages|creators|stories|posts|hashtags&q=&offset=
 * Every RPC enforces privacy itself (blocks, discoverability, membership, story/post audiences).
 * Messages need at least 2 characters.
 */
export const GET = handler(
  {
    query: z.object({
      type: z.enum(SEARCH_TYPES).default("all"),
      q: z.string().trim().min(1, "Type something to search").max(100),
      offset: z.coerce.number().int().min(0).max(1000).default(0),
    }),
    rateLimit: { name: "search", limit: 60, window: 60 },
  },
  async ({ supabase, user, query }): Promise<SearchResponse> => {
    const ctx: Ctx = { supabase, userId: user.id, q: query.q };
    if (query.type === "all") {
      const keys = Object.keys(FETCHERS) as SearchCategory[];
      const pages = await Promise.all(keys.map((k) => FETCHERS[k](ctx, k === "posts" ? 6 : ALL_LIMIT, 0)));
      const results = Object.fromEntries(keys.map((k, i) => [k, pages[i].items])) as SearchAllResult;
      return { type: "all", results };
    }
    return { type: query.type, page: await FETCHERS[query.type](ctx, PAGE, query.offset) };
  },
);
