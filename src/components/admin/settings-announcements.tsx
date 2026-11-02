"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Switch } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { adminKeys } from "./keys";
import { AdminPageHeader, fullDate, Panel, Select } from "./ui";
import type { Announcement, AppSettings } from "./types";

type SettingKey = "maintenance_mode" | "registration_open" | "limits" | "content_policy";

function useSaveSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (v: { key: SettingKey; value: unknown }) => api.patch("/api/admin/settings", v),
    onSuccess: () => {
      toast.success("Setting saved");
      void queryClient.invalidateQueries({ queryKey: adminKeys.settings });
    },
  });
}

function Updated({ s, k }: { s: AppSettings; k: SettingKey }) {
  const u = s.updated[k];
  if (!u?.updated_by) return null;
  return (
    <span>
      Last changed {fullDate(u.updated_at)} by @{u.updated_by.username}
    </span>
  );
}

function SaveRow({ onSave, pending, dirty, children }: { onSave: () => void; pending: boolean; dirty: boolean; children?: ReactNode }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <p className="text-xs text-muted">{children}</p>
      <Button size="sm" onClick={onSave} loading={pending} disabled={!dirty}>
        Save
      </Button>
    </div>
  );
}

function SettingsForm({ s }: { s: AppSettings }) {
  const save = useSaveSetting();
  const confirm = useConfirm();
  const [maint, setMaint] = useState(s.maintenance_mode);
  const [reg, setReg] = useState(s.registration_open);
  const [limits, setLimits] = useState(s.limits);
  const [policy, setPolicy] = useState(s.content_policy);
  const pending = (k: SettingKey) => save.isPending && save.variables?.key === k;
  const limitField = (k: keyof AppSettings["limits"], label: string) => (
    <Field label={label}>
      {(p) => (
        <Input {...p} type="number" min={1} max={10240} value={limits[k]} onChange={(e) => setLimits({ ...limits, [k]: Number(e.target.value) })} />
      )}
    </Field>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Maintenance mode" description="Blocks all write requests from non-admins and shows the message below.">
        <Switch checked={maint.enabled} onChange={(enabled) => setMaint({ ...maint, enabled })} label="Maintenance mode enabled" />
        <Field label="Message shown to users" hint="Up to 300 characters.">
          {(p) => <Textarea {...p} maxLength={300} value={maint.message} onChange={(e) => setMaint({ ...maint, message: e.target.value })} />}
        </Field>
        <SaveRow
          pending={pending("maintenance_mode")}
          dirty={maint.enabled !== s.maintenance_mode.enabled || maint.message !== s.maintenance_mode.message}
          onSave={async () => {
            if (maint.enabled && !s.maintenance_mode.enabled) {
              const ok = await confirm({
                title: "Enable maintenance mode?",
                description: "Users won't be able to send messages, post or change anything until it is turned off.",
                confirmLabel: "Enable",
                danger: true,
              });
              if (!ok) return;
            }
            save.mutate({ key: "maintenance_mode", value: { enabled: maint.enabled, message: maint.message.trim() } });
          }}
        >
          <Updated s={s} k="maintenance_mode" />
        </SaveRow>
      </Panel>

      <Panel title="Registration" description="Controls whether new accounts can be created.">
        <Switch checked={reg} onChange={setReg} label="Registration open" description="When off, the sign-up page rejects new accounts." />
        <SaveRow pending={pending("registration_open")} dirty={reg !== s.registration_open} onSave={() => save.mutate({ key: "registration_open", value: reg })}>
          <Updated s={s} k="registration_open" />
        </SaveRow>
      </Panel>

      <Panel title="Upload limits" description="Maximum sizes in megabytes.">
        <div className="grid gap-3 sm:grid-cols-3">
          {limitField("max_upload_mb_image", "Image (MB)")}
          {limitField("max_upload_mb_video", "Video (MB)")}
          {limitField("daily_upload_mb", "Daily per user (MB)")}
        </div>
        <SaveRow
          pending={pending("limits")}
          dirty={JSON.stringify(limits) !== JSON.stringify(s.limits)}
          onSave={() => save.mutate({ key: "limits", value: limits })}
        >
          <Updated s={s} k="limits" />
        </SaveRow>
      </Panel>

      <Panel title="Content policy" description="Bump the version when the community guidelines change.">
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <Field label="Version">
            {(p) => <Input {...p} type="number" min={1} value={policy.version} onChange={(e) => setPolicy({ ...policy, version: Number(e.target.value) })} />}
          </Field>
          <Field label="Guidelines URL" hint="A path such as /legal/community-guidelines or an https:// URL.">
            {(p) => <Input {...p} value={policy.url} maxLength={300} onChange={(e) => setPolicy({ ...policy, url: e.target.value })} />}
          </Field>
        </div>
        <SaveRow
          pending={pending("content_policy")}
          dirty={policy.version !== s.content_policy.version || policy.url !== s.content_policy.url}
          onSave={() => save.mutate({ key: "content_policy", value: { ...policy, url: policy.url.trim() } })}
        >
          <Updated s={s} k="content_policy" />
        </SaveRow>
      </Panel>
    </div>
  );
}

export function SettingsView() {
  const { data, isPending, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: adminKeys.settings,
    queryFn: () => api.get<AppSettings>("/api/admin/settings"),
  });
  return (
    <div>
      <AdminPageHeader title="Settings" description="Platform-wide configuration. Every change is recorded in the audit log." />
      {isPending ? (
        <ListSkeleton rows={4} />
      ) : error ? (
        <ErrorState description={error.message} onRetry={() => void refetch()} />
      ) : (
        <SettingsForm key={dataUpdatedAt} s={data} />
      )}
    </div>
  );
}

type Draft = { id: string | null; title: string; body: string; level: Announcement["level"]; active: boolean; endsAt: string };

const EMPTY: Draft = { id: null, title: "", body: "", level: "info", active: true, endsAt: "" };

function toLocalInput(iso: string | null) {
  return iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "";
}

function AnnouncementEditor({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [d, setD] = useState<Draft>(draft ?? EMPTY);
  const save = useMutation({
    mutationFn: (v: Draft) => {
      const body = {
        title: v.title.trim(),
        body: v.body.trim(),
        level: v.level,
        active: v.active,
        endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : null,
      };
      return v.id ? api.put(`/api/admin/announcements/${v.id}`, body) : api.post("/api/admin/announcements", body);
    },
    onSuccess: () => {
      toast.success("Announcement saved");
      void queryClient.invalidateQueries({ queryKey: adminKeys.announcements });
      onClose();
    },
  });
  return (
    <Dialog
      open={draft !== null}
      onClose={onClose}
      title={d.id ? "Edit announcement" : "New announcement"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} disabled={!d.title.trim()} onClick={() => save.mutate(d)}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (d.title.trim()) save.mutate(d);
        }}
      >
        <Field label="Title">{(p) => <Input {...p} data-autofocus maxLength={120} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} required />}</Field>
        <Field label="Message" hint="Up to 1000 characters.">
          {(p) => <Textarea {...p} maxLength={1000} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} />}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Level">
            {(p) => (
              <Select {...p} className="w-full" value={d.level} onChange={(e) => setD({ ...d, level: e.target.value as Draft["level"] })}>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </Select>
            )}
          </Field>
          <Field label="Ends at (optional)" hint="Your local time.">
            {(p) => <Input {...p} type="datetime-local" value={d.endsAt} onChange={(e) => setD({ ...d, endsAt: e.target.value })} />}
          </Field>
        </div>
        <Switch checked={d.active} onChange={(active) => setD({ ...d, active })} label="Active" description="Inactive announcements are hidden from users." />
      </form>
    </Dialog>
  );
}

export function AnnouncementsView() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [now] = useState(() => Date.now());
  const { data, isPending, error, refetch } = useQuery({
    queryKey: adminKeys.announcements,
    queryFn: () => api.get<Announcement[]>("/api/admin/announcements"),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/announcements/${id}`),
    onSuccess: () => {
      toast.success("Announcement deleted");
      void queryClient.invalidateQueries({ queryKey: adminKeys.announcements });
    },
  });
  const live = (a: Announcement) => a.active && new Date(a.starts_at).getTime() <= now && (!a.ends_at || new Date(a.ends_at).getTime() > now);

  return (
    <div>
      <AdminPageHeader
        title="Announcements"
        description="Banners shown to every user while active."
        actions={
          <Button onClick={() => setDraft({ ...EMPTY })}>
            <Plus className="h-4 w-4" aria-hidden /> New announcement
          </Button>
        }
      />
      {isPending ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <ErrorState description={error.message} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState icon={<Megaphone />} title="No announcements yet" description="Create one to inform all users about news or incidents." />
      ) : (
        <ul className="space-y-3">
          {data.map((a) => (
            <li key={a.id} className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-bold">{a.title}</h2>
                    <Badge tone={a.level === "critical" ? "danger" : a.level === "warning" ? "warning" : "brand"} className="capitalize">
                      {a.level}
                    </Badge>
                    <Badge tone={live(a) ? "success" : "muted"}>{live(a) ? "Live" : a.active ? "Scheduled / ended" : "Inactive"}</Badge>
                  </div>
                  {a.body ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-2">{a.body}</p> : null}
                  <p className="mt-2 text-xs text-muted">
                    Created {fullDate(a.created_at)}
                    {a.author ? ` by @${a.author.username}` : ""}
                    {a.ends_at ? ` · ends ${fullDate(a.ends_at)}` : " · no end date"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDraft({ id: a.id, title: a.title, body: a.body, level: a.level, active: a.active, endsAt: toLocalInput(a.ends_at) })
                    }
                  >
                    <Pencil className="h-4 w-4" aria-hidden /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    loading={remove.isPending && remove.variables === a.id}
                    onClick={async () => {
                      const ok = await confirm({ title: "Delete this announcement?", description: a.title, confirmLabel: "Delete", danger: true });
                      if (ok) remove.mutate(a.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden /> Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {draft ? <AnnouncementEditor key={draft.id ?? "new"} draft={draft} onClose={() => setDraft(null)} /> : null}
    </div>
  );
}
