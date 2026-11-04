"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Bookmark, ChevronDown, Compass, Hash, Plus, Search, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ListSkeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { compactNumber, displayName } from "@/lib/utils";
import { Feed } from "./feed";
import { patchPosts } from "./post-actions";
import type { Creator, DiscoverTab, TrendingTag } from "./types";

/** Sort options (feed modes of discover_feed, plus your saved posts). */
const TABS: { value: DiscoverTab; label: string }[] = [
  { value: "for_you", label: "Recommended" },
  { value: "trending", label: "Trending" },
  { value: "following", label: "Following" },
  { value: "saved", label: "Saved" },
];

/** Categories filter by the matching hashtag (#art, #sports, …). */
const CATEGORIES = [
  "Art", "Sports", "Cinema", "Vines", "Music", "Movies", "Esports", "Geography", "Discovery", "Cosmetics", "Technology", "Education", "Entertainment",
];

export function useTrendingTags() {
  return useQuery({ queryKey: ["discover-hashtags"], queryFn: () => api.get<TrendingTag[]>("/api/discover/hashtags"), staleTime: 5 * 60_000 });
}

function TagChips({ className }: { className?: string }) {
  const tags = useTrendingTags();
  if (!tags.data?.length) return null;
  return (
    <div className={className}>
      {tags.data.slice(0, 15).map((t) => (
        <Link
          key={t.tag}
          href={`/discover/tag/${t.tag}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink-2 hover:bg-brand-soft hover:text-brand"
        >
          <Hash className="h-3 w-3" aria-hidden />
          {t.tag}
          <span className="text-muted">{compactNumber(t.post_count)}</span>
        </Link>
      ))}
    </div>
  );
}

/** Creator search (empty query lists the most-followed creators). */
export function CreatorSearch() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const term = q.trim();
  const creators = useQuery({
    queryKey: qk.search("creators", term),
    queryFn: () => api.get<Creator[]>("/api/discover/creators", { q: term }),
    staleTime: 30_000,
  });
  const follow = useMutation({
    mutationFn: (c: Creator) => api.post<{ following: boolean }>(`/api/users/${c.id}/follow`),
    onSuccess: (res, c) => {
      qc.setQueriesData<Creator[]>({ queryKey: ["search", "creators"] }, (list) => list?.map((x) => (x.id === c.id ? { ...x, following: res.following } : x)));
      patchPosts(qc, (p) => p.author_id === c.id, () => ({ following: res.following }));
      void qc.invalidateQueries({ queryKey: qk.discover("following") });
    },
  });
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search creators" aria-label="Search creators" className="pl-9" maxLength={50} />
      </div>
      {creators.isPending ? (
        <ListSkeleton rows={3} />
      ) : !creators.data?.length ? (
        <p className="px-1 py-4 text-center text-sm text-muted">{term ? "No creators match that search." : "No creators yet."}</p>
      ) : (
        <ul className="space-y-1">
          {creators.data.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-surface-2">
              <Link href={`/profile/${c.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar mediaId={c.avatar_media_id} name={displayName(c)} size="md" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 truncate text-sm font-semibold">
                    {displayName(c)} {c.is_verified ? <BadgeCheck className="h-3.5 w-3.5 text-brand" aria-label="Verified" /> : null}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    @{c.username} · {compactNumber(c.follower_count)} followers
                  </span>
                </span>
              </Link>
              <Button
                size="sm"
                variant={c.following ? "outline" : "primary"}
                loading={follow.isPending && follow.variables?.id === c.id}
                onClick={() => follow.mutate(c)}
              >
                {c.following ? "Following" : "Follow"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DiscoverView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: DiscoverTab = TABS.some((t) => t.value === raw) ? (raw as DiscoverTab) : "for_you";
  const rawCategory = params.get("category")?.toLowerCase() ?? "";
  const category = CATEGORIES.some((c) => c.toLowerCase() === rawCategory) ? rawCategory : "";
  const [searchOpen, setSearchOpen] = useState(false);

  const go = (t: DiscoverTab, c: string) => {
    const q = new URLSearchParams();
    if (t !== "for_you") q.set("tab", t);
    if (c && t !== "saved") q.set("category", c);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const setTab = (t: DiscoverTab) => go(t, category);

  const empty =
    tab === "following" ? (
      <EmptyState
        icon={<Users />}
        title="Nothing from people you follow"
        description="Follow creators to see their latest posts here."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => setTab("trending")}>
              See what&apos;s trending
            </Button>
            <Button onClick={() => setSearchOpen(true)}>Find creators</Button>
          </div>
        }
      />
    ) : tab === "saved" ? (
      <EmptyState icon={<Bookmark />} title="No saved posts" description="Tap the bookmark on any post to keep it here." />
    ) : (
      <EmptyState
        icon={<Compass />}
        title="No posts yet"
        description="Be the first to share something on Discover."
        action={
          <Link href="/discover/new" className="text-sm font-semibold text-brand hover:underline">
            Create a post
          </Link>
        }
      />
    );

  return (
    <div className="flex h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] md:h-dvh">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="space-y-2 px-3 pt-3 md:px-6">
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 flex-1 truncate font-display text-xl font-extrabold tracking-tight">Discover</h1>
            <label className="relative inline-flex shrink-0 items-center">
              <span className="sr-only">Sort Discover</span>
              <select
                value={tab}
                onChange={(e) => setTab(e.target.value as DiscoverTab)}
                className="h-10 appearance-none rounded-full border border-border bg-surface-2 pl-4 pr-9 text-sm font-semibold text-ink outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
              >
                {TABS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted" aria-hidden />
            </label>
            <Button variant="secondary" size="icon" aria-label="Search creators" onClick={() => setSearchOpen(true)} className="lg:hidden">
              <Search className="h-5 w-5" />
            </Button>
            <Link href="/discover/new" aria-label="Create post" className="brand-gradient inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white">
              <Plus className="h-5 w-5" />
            </Link>
          </div>
          {tab !== "saved" ? (
            <div role="radiogroup" aria-label="Categories" className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {["", ...CATEGORIES.map((c) => c.toLowerCase())].map((c) => {
                const active = c === category;
                return (
                  <button
                    key={c || "all"}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => go(tab, c)}
                    className={
                      active
                        ? "shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-xs font-bold text-bg"
                        : "shrink-0 rounded-full bg-surface-2 px-3.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-3"
                    }
                  >
                    {c ? CATEGORIES.find((x) => x.toLowerCase() === c) : "All"}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="relative min-h-0 flex-1 pt-2">
          <Feed key={`${tab}:${category}`} tab={tab} tag={category || undefined} empty={empty} />
        </div>
      </div>
      <aside className="hidden w-80 shrink-0 space-y-6 overflow-y-auto border-l border-border p-5 scrollbar-thin lg:block">
        <section>
          <h2 className="mb-3 font-display text-base font-bold">Creators</h2>
          <CreatorSearch />
        </section>
        <section>
          <h2 className="mb-3 font-display text-base font-bold">Trending hashtags</h2>
          <TagChips className="flex flex-wrap gap-2" />
        </section>
      </aside>
      <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} variant="sheet" title="Find creators" className="h-[80dvh]">
        <CreatorSearch />
        <h3 className="mb-2 mt-5 text-sm font-bold">Trending hashtags</h3>
        <TagChips className="flex flex-wrap gap-2" />
      </Dialog>
    </div>
  );
}
