"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { api, ClientApiError } from "@/lib/api/client";
import { adminKeys } from "./keys";
import { Select } from "./ui";
import type { StatusChangeResult } from "./types";

export type ModerationKind = "warn" | "suspend" | "ban" | "restore" | "remove_content" | "restore_content";

export type ModerationRequest = {
  kind: ModerationKind;
  /** Account the action applies to (warn/suspend/ban/restore). */
  userId?: string | null;
  userLabel?: string;
  /** Content the action applies to (remove/restore content). */
  target?: { type: "story" | "post" | "comment" | "message" | "group"; id: string } | null;
  reportId?: string | null;
};

const COPY: Record<ModerationKind, { title: string; verb: string; danger: boolean; explain: string }> = {
  warn: {
    title: "Send a warning",
    verb: "Send warning",
    danger: false,
    explain: "The user receives a notification with your reason. The warning is recorded in their moderation history and can be appealed.",
  },
  suspend: {
    title: "Suspend account",
    verb: "Suspend",
    danger: true,
    explain: "The account is suspended for the chosen period and sign-in is blocked at the authentication layer. The user is notified and can appeal.",
  },
  ban: {
    title: "Ban account",
    verb: "Ban permanently",
    danger: true,
    explain: "The account is banned indefinitely and can no longer sign in. Only admins can ban. The user is notified and can appeal.",
  },
  restore: {
    title: "Restore account",
    verb: "Restore account",
    danger: false,
    explain: "The account becomes active again and the sign-in block is lifted.",
  },
  remove_content: {
    title: "Remove content",
    verb: "Remove content",
    danger: true,
    explain: "The content is hidden from everyone. Removed messages and groups cannot be restored. The owner is notified and can appeal.",
  },
  restore_content: {
    title: "Restore content",
    verb: "Restore content",
    danger: false,
    explain: "The content becomes visible again to its original audience.",
  },
};

const DURATIONS = [1, 3, 7, 14, 30, 90, 365];

/** Confirmation dialog with a required reason for every moderation action. */
export function ModerationDialog({
  request,
  onClose,
  onDone,
}: {
  request: ModerationRequest | null;
  onClose: () => void;
  onDone?: (kind: ModerationKind) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const copy = request ? COPY[request.kind] : null;

  const mutation = useMutation({
    meta: { silent: true },
    mutationFn: async (req: ModerationRequest) => {
      const reportId = req.reportId ?? undefined;
      switch (req.kind) {
        case "warn":
          return api.post(`/api/admin/users/${req.userId}/warn`, { reason, reportId });
        case "suspend":
        case "ban":
        case "restore":
          return api.post<StatusChangeResult>(`/api/admin/users/${req.userId}/status`, {
            status: req.kind === "suspend" ? "suspended" : req.kind === "ban" ? "banned" : "active",
            reason,
            days: req.kind === "suspend" ? days : undefined,
            reportId,
          });
        case "remove_content":
        case "restore_content":
          return api.post(`/api/admin/content`, {
            targetType: req.target!.type,
            targetId: req.target!.id,
            reason,
            reportId,
            restore: req.kind === "restore_content",
          });
      }
    },
    onSuccess: (result, req) => {
      const sync = (result as Partial<StatusChangeResult> | undefined)?.authSync;
      if (sync === "failed") toast.warning("Status updated, but the sign-in block could not be synced. It was logged under System → Errors.");
      else if (sync === "skipped") toast.warning("Status updated. Sign-in blocking needs SUPABASE_SERVICE_ROLE_KEY on the server.");
      else toast.success(`${COPY[req.kind].verb}: done`);
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
      setReason("");
      onDone?.(req.kind);
      onClose();
    },
    onError: (e) => {
      const msg = e instanceof ClientApiError && e.details && Array.isArray(e.details)
        ? (e.details as { message: string }[]).map((d) => d.message).join(" ")
        : e.message;
      setError(msg);
    },
  });

  const close = () => {
    if (mutation.isPending) return;
    setError(null);
    onClose();
  };

  const tooShort = reason.trim().length < 3;

  return (
    <Dialog
      open={request !== null}
      onClose={close}
      title={copy?.title}
      description={request?.userLabel ? `Account: ${request.userLabel}` : request?.target ? `Target: ${request.target.type}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant={copy?.danger ? "danger" : "primary"}
            loading={mutation.isPending}
            disabled={tooShort}
            onClick={() => {
              setError(null);
              if (request) mutation.mutate(request);
            }}
          >
            {copy?.verb}
          </Button>
        </>
      }
    >
      {request && copy ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!tooShort) mutation.mutate(request);
          }}
        >
          <p className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2">{copy.explain}</p>
          {request.kind === "suspend" ? (
            <Field label="Suspension length">
              {(p) => (
                <Select {...p} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full">
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} day{d > 1 ? "s" : ""}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : null}
          <Field
            label="Reason (required)"
            error={error}
            hint={request.kind === "restore" || request.kind === "restore_content" ? "Recorded in the audit log." : "Shown to the user and recorded in the audit log."}
          >
            {(p) => (
              <Textarea
                {...p}
                data-autofocus
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Repeated harassment of other users"
                required
              />
            )}
          </Field>
          {request.reportId ? <p className="text-xs text-muted">This action will be linked to the report.</p> : null}
        </form>
      ) : null}
    </Dialog>
  );
}
