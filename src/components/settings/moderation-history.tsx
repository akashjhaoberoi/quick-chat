"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Gavel, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { Textarea } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type ModerationAction = {
  id: string;
  action: "dismiss" | "warn" | "remove_content" | "suspend" | "ban" | "restore" | "restore_content";
  target_type: string;
  reason: string;
  expires_at: string | null;
  created_at: string;
};

type Appeal = { id: string; moderation_action_id: string; message: string; status: "pending" | "accepted" | "rejected"; response: string | null; created_at: string };

const ACTION_LABELS: Record<ModerationAction["action"], string> = {
  dismiss: "Report dismissed",
  warn: "Warning",
  remove_content: "Content removed",
  suspend: "Account suspended",
  ban: "Account banned",
  restore: "Account restored",
  restore_content: "Content restored",
};
const APPEALABLE = new Set(["warn", "remove_content", "suspend", "ban"]);

export function useModerationHistory(userId: string) {
  return useQuery({
    queryKey: ["moderation-history", userId],
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient();
      const [actions, appeals] = await Promise.all([
        supabase
          .from("moderation_actions")
          .select("id, action, target_type, reason, expires_at, created_at")
          .eq("target_user_id", userId)
          .neq("action", "dismiss")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("appeals").select("id, moderation_action_id, message, status, response, created_at").eq("user_id", userId),
      ]);
      if (actions.error) throw actions.error;
      if (appeals.error) throw appeals.error;
      return { actions: (actions.data ?? []) as ModerationAction[], appeals: (appeals.data ?? []) as Appeal[] };
    },
  });
}

function AppealDialog({ action, onClose, onDone }: { action: ModerationAction | null; onClose: () => void; onDone: () => void }) {
  const [message, setMessage] = useState("");
  const submit = useMutation({
    mutationFn: () => api.post<{ id: string }>("/api/appeals", { actionId: action!.id, message: message.trim() }),
    onSuccess: () => {
      toast.success("Appeal submitted. A moderator will review it.");
      setMessage("");
      onDone();
    },
  });
  const tooShort = message.trim().length < 10;
  return (
    <Dialog
      open={action !== null}
      onClose={onClose}
      variant="sheet"
      title="Appeal this decision"
      description="Explain why you think this decision was a mistake. Each decision can be appealed once."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gradient" disabled={tooShort} loading={submit.isPending} onClick={() => submit.mutate()}>
            Submit appeal
          </Button>
        </>
      }
    >
      {action ? (
        <p className="mb-3 rounded-2xl bg-surface-2 p-3 text-sm">
          <strong>{ACTION_LABELS[action.action]}</strong>
          {action.reason ? ` — ${action.reason}` : ""}
        </p>
      ) : null}
      <label className="block text-sm font-semibold">
        Your appeal
        <Textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, 2000))} className="mt-1.5 min-h-32" placeholder="At least 10 characters" />
      </label>
      <p className="mt-1 text-right text-xs text-muted">{message.length}/2000</p>
    </Dialog>
  );
}

/** The user's own moderation decisions with appeal status and an appeal form. */
export function ModerationHistory({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const history = useModerationHistory(userId);
  const [appealing, setAppealing] = useState<ModerationAction | null>(null);

  if (history.isPending) return <ListSkeleton rows={2} />;
  if (history.isError) return <ErrorState onRetry={() => void history.refetch()} />;
  if (history.data.actions.length === 0) {
    return <EmptyState icon={<ShieldCheck />} title="Your account is in good standing" description="There are no moderation decisions on your account." className="py-8" />;
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {history.data.actions.map((a) => {
          const appeal = history.data.appeals.find((x) => x.moderation_action_id === a.id);
          return (
            <li key={a.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger">
                    <Gavel className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{ACTION_LABELS[a.action]}</p>
                    <p className="text-xs text-muted">
                      {format(new Date(a.created_at), "d MMM yyyy")}
                      {a.expires_at ? ` · until ${format(new Date(a.expires_at), "d MMM yyyy, HH:mm")}` : ""}
                    </p>
                    {a.reason ? <p className="mt-1 text-sm text-ink-2">Reason: {a.reason}</p> : null}
                  </div>
                </div>
                {appeal ? (
                  <Badge tone={appeal.status === "accepted" ? "success" : appeal.status === "rejected" ? "danger" : "warning"}>
                    Appeal {appeal.status}
                  </Badge>
                ) : APPEALABLE.has(a.action) ? (
                  <Button variant="outline" size="sm" onClick={() => setAppealing(a)}>
                    Appeal
                  </Button>
                ) : null}
              </div>
              {appeal?.response ? <p className="ml-12 mt-2 rounded-xl bg-surface-2 p-2.5 text-xs text-ink-2">Moderator response: {appeal.response}</p> : null}
            </li>
          );
        })}
      </ul>
      <AppealDialog
        action={appealing}
        onClose={() => setAppealing(null)}
        onDone={() => {
          setAppealing(null);
          void queryClient.invalidateQueries({ queryKey: ["moderation-history", userId] });
        }}
      />
    </>
  );
}
