"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Clock, Hash, Search, SearchX, TrendingUp, X } from "lucide-react";
import { PageContainer } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/controls";
import { EmptyState, ErrorState, ListSkeleton, Skeleton } from "@/components/ui/feedback";
import { AddFriendButton } from "@/components/friends/add-friend-button";
import { useDebounced } from "@/components/friends/discover-tabs";
import { useFriendSuggestions } from "@/components/friends/hooks";
import { UserRow } from "@/components/friends/user-row";
import { api, errorMessage } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import { compactNumber } from "@/lib/utils";
import {
  CATEGORY_LABEL,
  CreatorHits,
  GroupHits,
  HashtagHits,
  MessageHits,
  PostHits,
  StoryHits,
  UserHits,
} from "./search-results";
import { SEARCH_TYPES, type SearchAllResult, type SearchCategory, type SearchHitMap, type SearchPage, type SearchResponse, type SearchType } from "./types";

const RECENT_KEY = "qc-recent-searches";
const ORDER: SearchCategory[] = ["users", "creators", "groups", "messages", "stories", "posts", "hashtags"];

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
}
function writeRecent(list: string[]) {
  try {
    if (list.length) localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    else localStorage.removeItem(RECENT_KEY);
  } catch {
    // storage unavailable (private mode) — recent searches are a convenience only
  }
}

function minLength(type: SearchType) {
  return type === "messages" ? 2 : 1;
}

function Hits<K extends SearchCategory>({ type, items, q, onPick }: { type: K; items: SearchHitMap[K][]; q: string; onPick: () => void }) {
  switch (type) {
    case "users":
      return <UserHits items={items as SearchHitMap["users"][]} onPick={onPick} />;
    case "creators":
      return <CreatorHits items={items as SearchHitMap["creators"][]} onPick={onPick} />;
    case "groups":
      return <GroupHits items={items as SearchHitMap["groups"][]} q={q} onPick={onPick} />;
    case "messages":
      return <MessageHits items={items as SearchHitMap["messages"][]} q={q} onPick={onPick} />;
    case "stories":
      return <StoryHits items={items as SearchHitMap["stories"][]} q={q} onPick={onPick} />;
    case "posts":
      return <PostHits items={items as SearchHitMap["posts"][]} onPick={onPick} />;
    default:
      return <HashtagHits items={items as SearchHitMap["hashtags"][]} onPick={onPick} />;
  }
}

function ResultsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Searching">
      <Skeleton className="mx-2 mb-2 mt-4 h-3 w-24" />
      <ListSkeleton rows={4} />
    </div>
  );
}

function AllResults({ q, onSeeAll, onPick }: { q: string; onSeeAll: (t: SearchCategory) => void; onPick: () => void }) {
  const query = useQuery({
    queryKey: qk.search("all", q),
    queryFn: () => api.get<SearchResponse>("/api/search", { type: "all", q }),
    select: (r) => (r.type === "all" ? r.results : null),
    placeholderData: (prev) => prev,
  });
  if (query.isPending) return <ResultsSkeleton />;
  if (query.isError) return <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const results = query.data as SearchAllResult;
  const sections = ORDER.filter((k) => results[k]?.length);
  if (sections.length === 0) {
    return <EmptyState icon={<SearchX />} title="No results" description={`Nothing matches “${q}”. Try a different spelling or a username.`} />;
  }
  return (
    <div className="space-y-6" aria-busy={query.isFetching}>
      {sections.map((k, i) => (
        <motion.section
          key={k}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: i * 0.04 }}
          aria-labelledby={`sr-${k}`}
        >
          <div className="mb-1 flex items-center justify-between px-1">
            <h2 id={`sr-${k}`} className="text-xs font-bold uppercase tracking-wider text-muted">
              {CATEGORY_LABEL[k]}
            </h2>
            <button type="button" onClick={() => onSeeAll(k)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
              See all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          <Hits type={k} items={results[k] as SearchHitMap[typeof k][]} q={q} onPick={onPick} />
        </motion.section>
      ))}
    </div>
  );
}

function CategoryResults({ type, q, onPick }: { type: SearchCategory; q: string; onPick: () => void }) {
  const query = useInfiniteQuery({
    queryKey: qk.search(type, q),
    enabled: q.length >= minLength(type),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const r = await api.get<SearchResponse>("/api/search", { type, q, offset: pageParam });
      return (r.type === "all" ? { items: [], nextOffset: null } : r.page) as SearchPage;
    },
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  if (q.length < minLength(type)) {
    return <EmptyState icon={<Search />} title="Keep typing" description="Message search needs at least 2 characters." />;
  }
  if (query.isPending) return <ResultsSkeleton />;
  if (query.isError) return <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const items = query.data.pages.flatMap((p) => p.items);
  if (items.length === 0) {
    return <EmptyState icon={<SearchX />} title={`No ${CATEGORY_LABEL[type].toLowerCase()} found`} description={`Nothing matches “${q}”.`} />;
  }
  return (
    <div className="space-y-4">
      <Hits type={type} items={items as SearchHitMap[typeof type][]} q={q} onPick={onPick} />
      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Suggestions({ recent, onPickRecent, onRemoveRecent, onClearRecent }: {
  recent: string[];
  onPickRecent: (q: string) => void;
  onRemoveRecent: (q: string) => void;
  onClearRecent: () => void;
}) {
  const trending = useQuery({
    queryKey: ["search", "trending-hashtags"],
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient().rpc("trending_hashtags", { p_limit: 12 });
      if (error) throw error;
      return ((data ?? []) as { tag: string; post_count: number }[]).map((t) => ({ ...t, post_count: Number(t.post_count) }));
    },
    staleTime: 5 * 60_000,
  });
  const people = useFriendSuggestions(6);

  const section = (title: ReactNode, body: ReactNode, action?: ReactNode) => (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">{title}</h2>
        {action}
      </div>
      {body}
    </section>
  );

  return (
    <div className="space-y-7">
      {recent.length
        ? section(
            <>
              <Clock className="h-3.5 w-3.5" aria-hidden /> Recent
            </>,
            <ul className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <li key={r} className="inline-flex items-center rounded-full bg-surface-2 text-sm">
                  <button type="button" onClick={() => onPickRecent(r)} className="py-1.5 pl-3 pr-1 font-medium hover:text-brand">
                    {r}
                  </button>
                  <button type="button" onClick={() => onRemoveRecent(r)} aria-label={`Remove ${r} from recent searches`} className="rounded-full p-1.5 text-muted hover:text-ink">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>,
            <button type="button" onClick={onClearRecent} className="text-xs font-semibold text-brand hover:underline">
              Clear
            </button>,
          )
        : null}
      {trending.data?.length
        ? section(
            <>
              <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Trending tags
            </>,
            <ul className="flex flex-wrap gap-2">
              {trending.data.map((t) => (
                <li key={t.tag}>
                  <Link
                    href={`/discover/tag/${encodeURIComponent(t.tag)}`}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-semibold hover:border-brand hover:text-brand"
                  >
                    <Hash className="h-3.5 w-3.5" aria-hidden />
                    {t.tag}
                    <span className="text-xs font-medium text-muted">{compactNumber(t.post_count)}</span>
                  </Link>
                </li>
              ))}
            </ul>,
          )
        : trending.isPending
          ? <Skeleton className="h-9 w-2/3" />
          : null}
      {people.isPending ? (
        <ListSkeleton rows={3} />
      ) : people.data?.length ? (
        section(
          "People you may know",
          <ul className="space-y-0.5">
            {people.data.map((s, i) => (
              <UserRow
                key={s.id}
                index={i}
                user={s}
                subtitle={s.mutual_count ? `@${s.username} · ${s.mutual_count} mutual` : `@${s.username}`}
                actions={<AddFriendButton userId={s.id} hint="none" />}
              />
            ))}
          </ul>,
          <Link href="/friends?tab=suggestions" className="text-xs font-semibold text-brand hover:underline">
            See all
          </Link>,
        )
      ) : null}
      {!recent.length && !trending.data?.length && !people.data?.length && !trending.isPending && !people.isPending ? (
        <EmptyState icon={<Search />} title="Search Quick Chat" description="Find people, groups, messages, creators, stories, posts and tags." />
      ) : null}
    </div>
  );
}

export function SearchView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQ = params.get("q") ?? "";
  const rawType = params.get("type") ?? "all";
  const type: SearchType = (SEARCH_TYPES as readonly string[]).includes(rawType) ? (rawType as SearchType) : "all";

  const [input, setInput] = useState(urlQ);
  const [recent, setRecent] = useState<string[]>(() => (typeof window === "undefined" ? [] : readRecent()));
  const inputRef = useRef<HTMLInputElement>(null);
  const q = useDebounced(input.trim(), 300);

  // Keep ?q= in the URL (shareable, back-button friendly) once typing settles.
  useEffect(() => {
    if (q === urlQ.trim()) return;
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (type !== "all") sp.set("type", type);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [q, urlQ, type, pathname, router]);

  const setType = (t: SearchType) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (t !== "all") sp.set("type", t);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const remember = (term = q) => {
    const t = term.trim();
    if (!t) return;
    const next = [t, ...recent.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 10);
    setRecent(next);
    writeRecent(next);
  };

  return (
    <PageContainer>
      <div className="sticky top-14 z-20 space-y-3 bg-bg/90 px-4 pb-3 pt-4 backdrop-blur-xl md:top-0 md:px-6 md:pt-6">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            remember(input);
            inputRef.current?.blur();
          }}
          className="relative"
        >
          <label htmlFor="global-search" className="sr-only">
            Search Quick Chat
          </label>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id="global-search"
            ref={inputRef}
            type="search"
            autoFocus
            autoComplete="off"
            enterKeyHint="search"
            value={input}
            maxLength={100}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search people, groups, messages, tags…"
            className="h-12 w-full rounded-2xl border border-border bg-surface pl-12 pr-11 text-[15px] shadow-[var(--shadow-soft)] focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]"
          />
          {input ? (
            <button
              type="button"
              onClick={() => {
                setInput("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </form>
        {q ? (
          <div className="-mx-4 overflow-x-auto px-4 no-scrollbar md:mx-0 md:px-0">
            <Tabs
              ariaLabel="Search categories"
              value={type}
              onChange={setType}
              className="min-w-[640px]"
              items={SEARCH_TYPES.map((t) => ({ value: t, label: t === "all" ? "All" : CATEGORY_LABEL[t] }))}
            />
          </div>
        ) : null}
      </div>
      <div className="px-4 pb-10 pt-2 md:px-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={q ? `${type}` : "idle"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            {!q ? (
              <Suggestions
                recent={recent}
                onPickRecent={(r) => setInput(r)}
                onRemoveRecent={(r) => {
                  const next = recent.filter((x) => x !== r);
                  setRecent(next);
                  writeRecent(next);
                }}
                onClearRecent={() => {
                  setRecent([]);
                  writeRecent([]);
                }}
              />
            ) : type === "all" ? (
              <AllResults q={q} onSeeAll={setType} onPick={() => remember()} />
            ) : (
              <CategoryResults type={type} q={q} onPick={() => remember()} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </PageContainer>
  );
}
