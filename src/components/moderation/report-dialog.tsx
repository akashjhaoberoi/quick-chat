"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { ReportReason, ReportTarget } from "@/types/models";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hate speech" },
  { value: "nudity", label: "Nudity or sexual content" },
  { value: "violence", label: "Violence or threats" },
  { value: "self_harm", label: "Self-harm" },
  { value: "scam", label: "Scam or fraud" },
  { value: "impersonation", label: "Impersonation" },
  { value: "underage", label: "Involves a minor" },
  { value: "other", label: "Something else" },
];

/**
 * Reports content to moderators. For private messages the server snapshots
 * only the reported message — moderators never get access to the rest of
 * the conversation.
 */
export function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
  targetLabel,
}: {
  open: boolean;
  onClose: () => void;
  targetType: ReportTarget;
  targetId: string;
  targetLabel?: string;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const mutation = useMutation({
    mutationFn: () => api.post("/api/reports", { targetType, targetId, reason, details: details.trim() || undefined }),
    onSuccess: () => {
      toast.success("Thanks — our moderators will review this report.");
      setReason(null);
      setDetails("");
      onClose();
    },
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title={`Report ${targetLabel ?? targetType}`}
      description="Reports are confidential. The person you report won't be told who reported them."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!reason} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Submit report
          </Button>
        </>
      }
    >
      <fieldset className="space-y-1.5">
        <legend className="mb-2 text-sm font-semibold">Why are you reporting this?</legend>
        {REASONS.map((r) => (
          <label
            key={r.value}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-medium",
              reason === r.value ? "border-brand bg-brand-soft" : "border-border hover:bg-surface-2",
            )}
          >
            <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-[var(--brand)]" />
            {r.label}
          </label>
        ))}
      </fieldset>
      <label className="mt-4 block text-sm font-semibold">
        Additional details (optional)
        <Textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} className="mt-1.5" placeholder="Anything that helps us understand" />
      </label>
    </Dialog>
  );
}
