"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, Mail, PauseCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useMe } from "@/components/providers/session-provider";
import { FormAlert } from "@/components/auth/auth-bits";
import { appOrigin, authErrorMessage } from "@/components/auth/auth-utils";
import { api } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { emailSchema } from "@/lib/validation";
import { ModerationHistory } from "./moderation-history";
import { SettingsPageHeader } from "./settings-shell";
import { SettingsSection } from "./settings-ui";

function EmailSection() {
  const me = useMe();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(
    params.get("email") === "updated" ? { tone: "success", text: "Your email address was updated." } : null,
  );
  const [busy, setBusy] = useState(false);
  const pending = me.user.new_email;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setStatus({ tone: "error", text: parsed.error.issues[0]?.message ?? "Enter a valid email" });
    if (parsed.data === me.user.email) return setStatus({ tone: "error", text: "That's already your email address." });
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().auth.updateUser(
      { email: parsed.data },
      { emailRedirectTo: `${appOrigin()}/auth/confirm?next=/settings/account` },
    );
    setBusy(false);
    if (error) return setStatus({ tone: "error", text: authErrorMessage(error) });
    setEmail("");
    setStatus({ tone: "info", text: `Check ${parsed.data} (and possibly your current inbox) for confirmation links. The change takes effect once confirmed.` });
  }

  return (
    <SettingsSection title="Email address" description="Used to sign in and for security alerts. Never shown to other people.">
      {status ? <FormAlert tone={status.tone}>{status.text}</FormAlert> : null}
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
        <Mail className="h-4 w-4 text-muted" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{me.user.email}</span>
      </div>
      {pending ? <p className="mb-3 text-xs text-muted">Pending change to {pending} — waiting for confirmation.</p> : null}
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end" noValidate>
        <Field label="New email" className="flex-1">
          {(p) => <Input {...p} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new@example.com" />}
        </Field>
        <Button type="submit" variant="outline" className="h-11" loading={busy} disabled={!email}>
          Change email
        </Button>
      </form>
    </SettingsSection>
  );
}

function DangerZone() {
  const me = useMe();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");

  const deactivate = useMutation({
    mutationFn: () => api.post("/api/account/deactivate"),
    onSuccess: async () => {
      await getSupabaseBrowserClient().auth.signOut({ scope: "local" }).catch(() => undefined);
      queryClient.clear();
      // Full reload on purpose: drops every cached query of the ended session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login?deactivated=1");
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete("/api/account", { confirmUsername: typed.trim() }),
    onSuccess: async () => {
      await getSupabaseBrowserClient().auth.signOut({ scope: "local" }).catch(() => undefined);
      queryClient.clear();
      // Full reload on purpose: drops every cached query of the ended session.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/login?deleted=1");
    },
  });
  const matches = typed.trim().replace(/^@/, "").toLowerCase() === me.profile.username;

  return (
    <SettingsSection title="Deactivate or delete" description="Take a break, or leave Quick Chat for good.">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center">
          <PauseCircle className="h-6 w-6 shrink-0 text-warning" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Deactivate account</p>
            <p className="text-xs text-muted">Your profile is hidden and you&apos;re signed out everywhere. Sign in again any time to reactivate — nothing is deleted.</p>
          </div>
          <Button
            variant="outline"
            loading={deactivate.isPending}
            onClick={async () => {
              if (await confirm({ title: "Deactivate your account?", description: "You'll be signed out on all devices. Sign in again to reactivate.", confirmLabel: "Deactivate", danger: true })) {
                deactivate.mutate();
              }
            }}
          >
            Deactivate
          </Button>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-danger/40 bg-danger-soft/40 p-4 sm:flex-row sm:items-center">
          <Trash2 className="h-6 w-6 shrink-0 text-danger" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Delete account permanently</p>
            <p className="text-xs text-muted">Deletes your profile, Snaps, Stories, posts, uploaded media and settings, and erases the content of messages you sent. This can&apos;t be undone.</p>
          </div>
          <Button variant="danger" onClick={() => setDeleting(true)}>
            Delete
          </Button>
        </div>
      </div>
      <Dialog
        open={deleting}
        onClose={() => {
          setDeleting(false);
          setTyped("");
        }}
        title="Delete your account?"
        description="This permanently deletes your account and everything in it. Copies other people saved (for example, screenshots) can't be recalled."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={!matches} loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete forever
            </Button>
          </>
        }
      >
        <div className="mb-3 flex items-start gap-2 rounded-2xl bg-danger-soft p-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> This action is irreversible.
        </div>
        <Field label={`Type your username (${me.profile.username}) to confirm`}>
          {(p) => <Input {...p} value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="none" autoComplete="off" spellCheck={false} data-autofocus />}
        </Field>
      </Dialog>
    </SettingsSection>
  );
}

export function AccountSettings() {
  const me = useMe();
  return (
    <div className="space-y-4 px-4 pb-10 md:px-0">
      <SettingsPageHeader title="Account" description={`@${me.profile.username} · member since ${format(new Date(me.profile.created_at), "MMMM yyyy")}`} />
      <EmailSection />
      <SettingsSection title="Account standing" description="Moderation decisions on your account. You can appeal decisions you disagree with.">
        <ModerationHistory userId={me.user.id} />
      </SettingsSection>
      <DangerZone />
    </div>
  );
}
