"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flag, MessageCircle, Send, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { useSession } from "@/components/providers/session-provider";
import { api, errorMessage } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { displayName, relativeTime } from "@/lib/utils";
import type { FeedPost, PostComment } from "@/types/models";
import { patchPosts } from "./post-actions";
import type { CommentAuthor, CommentsResponse } from "./types";

type Item = PostComment & { author: CommentAuthor | null };

/** Comment list + composer for one post (used in the sheet and on the post page). */
export function CommentsPanel({ post }: { post: FeedPost }) {
  const qc = useQueryClient();
  const { me } = useSession();
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Item | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const query = useQuery({
    queryKey: qk.comments(post.id),
    queryFn: () => api.get<CommentsResponse>(`/api/discover/posts/${post.id}/comments`),
  });

  const add = useMutation({
    mutationFn: () => api.post<Item>(`/api/discover/posts/${post.id}/comments`, { body: body.trim(), parentId: replyTo ? (replyTo.parent_id ?? replyTo.id) : undefined }),
    onSuccess: () => {
      setBody("");
      setReplyTo(null);
      patchPosts(qc, (p) => p.id === post.id, (p) => ({ comment_count: p.comment_count + 1 }));
      void qc.invalidateQueries({ queryKey: qk.comments(post.id) });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/discover/comments/${id}`),
    onSuccess: () => {
      patchPosts(qc, (p) => p.id === post.id, (p) => ({ comment_count: Math.max(0, p.comment_count - 1) }));
      void qc.invalidateQueries({ queryKey: qk.comments(post.id) });
    },
  });

  const canDelete = (c: Item) => Boolean(me && (c.user_id === me.user.id || post.author_id === me.user.id));

  const row = (c: Item, reply = false) => (
    <div key={c.id} className={reply ? "ml-11 mt-3 flex gap-2.5" : "flex gap-3"}>
      <Link href={c.author ? `/profile/${c.author.username}` : "#"} aria-label={c.author ? `@${c.author.username}` : "Unknown user"}>
        <Avatar mediaId={c.author?.avatar_media_id} name={displayName(c.author)} size={reply ? "xs" : "sm"} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted">
          <span className="font-semibold text-ink">{c.author ? `@${c.author.username}` : "Unknown user"}</span> · {relativeTime(c.created_at)}
        </p>
        <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
        <div className="mt-1 flex gap-3 text-xs font-semibold text-muted">
          <button type="button" onClick={() => setReplyTo(c)} className="hover:text-ink">
            Reply
          </button>
          {canDelete(c) ? (
            <button type="button" onClick={() => remove.mutate(c.id)} className="inline-flex items-center gap-1 hover:text-danger" aria-label="Delete comment">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          ) : null}
          {me && c.user_id !== me.user.id ? (
            <button type="button" onClick={() => setReporting(c.id)} className="inline-flex items-center gap-1 hover:text-danger" aria-label="Report comment">
              <Flag className="h-3 w-3" /> Report
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto py-2 scrollbar-thin">
        {query.isPending ? (
          <ListSkeleton rows={4} />
        ) : query.isError ? (
          <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : query.data.comments.length === 0 ? (
          <EmptyState icon={<MessageCircle />} title="No comments yet" description="Start the conversation." />
        ) : (
          query.data.comments.map((c) => (
            <div key={c.id}>
              {row(c)}
              {c.replies.map((r) => row(r, true))}
            </div>
          ))
        )}
      </div>
      <form
        className="border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate();
        }}
      >
        {replyTo ? (
          <p className="mb-2 flex items-center justify-between text-xs text-muted">
            Replying to @{replyTo.author?.username ?? "user"}
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="rounded-full p-1 hover:bg-surface-2">
              <X className="h-3.5 w-3.5" />
            </button>
          </p>
        ) : null}
        <div className="flex gap-2">
          <Input value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} placeholder="Add a comment…" aria-label="Comment" />
          <Button type="submit" size="icon" loading={add.isPending} disabled={!body.trim()} aria-label="Post comment">
            {add.isPending ? null : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </form>
      {reporting ? <ReportDialog open onClose={() => setReporting(null)} targetType="comment" targetId={reporting} targetLabel="comment" /> : null}
    </div>
  );
}

export function CommentsSheet({ post, open, onClose }: { post: FeedPost | null; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open && Boolean(post)} onClose={onClose} variant="sheet" title={post ? `Comments (${post.comment_count})` : "Comments"} className="h-[75dvh]">
      {post ? <CommentsPanel post={post} /> : null}
    </Dialog>
  );
}
