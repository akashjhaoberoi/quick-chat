"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Image as ImageIcon, Scale } from "lucide-react";
import { Badge, Tabs } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { ModerationDialog, type ModerationRequest } from "./action-dialog";
import { adminKeys } from "./keys";
import { AdminPageHeader, FilterLabel, fullDate, MediaPreview, Pagination, Panel, Select, TimeCell, UserLink } from "./ui";
import { ACTION_LABEL, type AppealRow, type ContentPost, type ContentStory, type Page } from "./types";

function AppealCard({ appeal }: { appeal: AppealRow }) {
  const queryClient = useQueryClient();
  const [response, setResponse] = useState("");
  const review = useMutation({
    mutationFn: (accept: boolean) => api.post<{ authSync: string | null }>(`/api/admin/appeals/${appeal.id}`, { accept, response }),
    onSuccess: (res, accept) => {
      if (res.authSync === "failed") toast.warning("Appeal accepted, but the sign-in block could not be lifted. See System → Errors.");
      else toast.success(accept ? "Appeal accepted" : "Appeal rejected");
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
    },
  });
  const a = appeal.action;
  const pending = appeal.status === "pending";
  return (
    <article className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)] sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <UserLink user={appeal.user} sub={<TimeCell iso={appeal.created_at} />} />
        <Badge tone={pending ? "warning" : appeal.status === "accepted" ? "success" : "muted"} className="capitalize">
          {appeal.status}
        </Badge>
      </header>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section aria-label="Original moderation action" className="rounded-xl bg-surface-2 p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Original action</p>
          {a ? (
            <>
              <p className="mt-1 font-semibold">
                {ACTION_LABEL[a.action]}
                {a.target_type !== "user" ? ` · ${a.target_type}` : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-ink-2">{a.reason || "No reason recorded."}</p>
              <p className="mt-1 text-xs text-muted">
                {a.moderator ? `By @${a.moderator.username} · ` : ""}
                {fullDate(a.created_at)}
                {a.expires_at ? ` · expires ${fullDate(a.expires_at)}` : ""}
                {a.report_id ? (
                  <>
                    {" · "}
                    <Link href={`/admin/reports/${a.report_id}`} className="text-brand hover:underline">
                      report
                    </Link>
                  </>
                ) : null}
              </p>
            </>
          ) : (
            <p className="mt-1 text-muted">The original action no longer exists.</p>
          )}
        </section>
        <section aria-label="Appeal message" className="text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">User&apos;s appeal</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{appeal.message}</p>
        </section>
      </div>
      {pending ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <Field label="Response to the user (required)" hint="Accepting a suspension or ban restores the account; accepting a content removal restores the content.">
            {(p) => <Textarea {...p} value={response} maxLength={1000} onChange={(e) => setResponse(e.target.value)} className="min-h-20" />}
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={response.trim().length < 3}
              loading={review.isPending && review.variables === false}
              onClick={() => review.mutate(false)}
            >
              Reject appeal
            </Button>
            <Button disabled={response.trim().length < 3} loading={review.isPending && review.variables === true} onClick={() => review.mutate(true)}>
              Accept appeal
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-4 border-t border-border pt-3 text-sm text-ink-2">
          <span className="font-semibold">Response:</span> {appeal.response || "—"}
          <span className="block text-xs text-muted">
            {appeal.reviewer ? `Reviewed by @${appeal.reviewer.username} · ` : ""}
            {fullDate(appeal.reviewed_at)}
          </span>
        </p>
      )}
    </article>
  );
}

export function AppealsView() {
  const [status, setStatus] = useState("pending");
  const [offset, setOffset] = useState(0);
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: adminKeys.appeals(status, offset),
    queryFn: () => api.get<Page<AppealRow>>("/api/admin/appeals", { status, offset }),
    placeholderData: keepPreviousData,
  });
  return (
    <div>
      <AdminPageHeader
        title="Appeals"
        description="Users can appeal warnings, removals, suspensions and bans. Pending appeals are shown oldest first."
        actions={
          <FilterLabel label="Status">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
            >
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </Select>
          </FilterLabel>
        }
      />
      {isPending ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorState description={error.message} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState icon={<Scale />} title="No appeals" description="Nothing matches this filter." />
      ) : (
        <div className="space-y-4" aria-busy={isFetching}>
          {data.items.map((a) => (
            <AppealCard key={a.id} appeal={a} />
          ))}
          <Pagination
            offset={data.offset}
            limit={data.limit}
            count={data.items.length}
            total={data.total}
            hasMore={data.hasMore}
            onChange={setOffset}
            disabled={isFetching}
          />
        </div>
      )}
    </div>
  );
}

type Kind = "posts" | "stories";

export function ContentView() {
  const [kind, setKind] = useState<Kind>("posts");
  const [state, setState] = useState("all");
  const [offset, setOffset] = useState(0);
  const [request, setRequest] = useState<ModerationRequest | null>(null);
  const [now] = useState(() => Date.now());
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: adminKeys.content(kind, state, offset),
    queryFn: () => api.get<Page<ContentPost | ContentStory>>("/api/admin/content", { kind, state, offset }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <AdminPageHeader title="Content" description="Recent public posts and public stories. Removing content notifies the owner, who can appeal." />
      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-end sm:justify-between">
          <Tabs<Kind>
            ariaLabel="Content type"
            className="sm:w-72"
            value={kind}
            onChange={(v) => {
              setKind(v);
              setOffset(0);
            }}
            items={[
              { value: "posts", label: "Posts" },
              { value: "stories", label: "Stories" },
            ]}
          />
          <FilterLabel label="State">
            <Select
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setOffset(0);
              }}
            >
              <option value="all">All</option>
              <option value="active">Visible</option>
              <option value="removed">Removed</option>
            </Select>
          </FilterLabel>
        </div>
        {isPending ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <ErrorState description={error.message} onRetry={() => void refetch()} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<ImageIcon />} title={`No ${kind} found`} />
        ) : (
          <ul className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy={isFetching}>
            {data.items.map((item) => {
              const isPost = kind === "posts";
              const removed = isPost ? (item as ContentPost).status === "removed" : Boolean((item as ContentStory).removed_at);
              const expired = !isPost && new Date((item as ContentStory).expires_at).getTime() < now;
              const target = { type: isPost ? ("post" as const) : ("story" as const), id: item.id };
              return (
                <li key={item.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
                  <MediaPreview mediaId={item.media_id} kind={item.media_kind} className="aspect-[4/3] w-full rounded-none" alt={item.caption || "Content preview"} />
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <UserLink user={item.author} />
                      <Badge tone={removed ? "danger" : expired ? "muted" : "success"}>{removed ? "Removed" : expired ? "Expired" : "Visible"}</Badge>
                    </div>
                    <p className="line-clamp-3 break-words text-sm text-ink-2">{item.caption || <span className="text-muted">No caption</span>}</p>
                    <p className="text-xs text-muted">
                      <TimeCell iso={item.created_at} />
                      {isPost
                        ? ` · ${(item as ContentPost).like_count} likes · ${(item as ContentPost).comment_count} comments`
                        : ` · ${(item as ContentStory).view_count} views`}
                    </p>
                    <div className="mt-auto pt-1">
                      <Button
                        size="sm"
                        variant={removed ? "outline" : "danger"}
                        className="w-full"
                        onClick={() => setRequest({ kind: removed ? "restore_content" : "remove_content", target })}
                      >
                        {removed ? "Restore" : "Remove"}
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {data ? (
          <Pagination
            offset={data.offset}
            limit={data.limit}
            count={data.items.length}
            total={data.total}
            hasMore={data.hasMore}
            onChange={setOffset}
            disabled={isFetching}
          />
        ) : null}
      </Panel>
      <ModerationDialog request={request} onClose={() => setRequest(null)} />
    </div>
  );
}
