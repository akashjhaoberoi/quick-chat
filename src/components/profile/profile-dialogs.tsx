"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Camera, ImagePlus, Loader2, Trash2, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, ListSkeleton, SetupNotice } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useAppConfig } from "@/hooks/use-app-config";
import { api, errorMessage } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uploadMedia, type UploadHandle } from "@/lib/upload";
import { cn, displayName, mediaUrl } from "@/lib/utils";
import { displayNameSchema } from "@/lib/validation";
import type { Profile, UserCard } from "@/types/models";

type Slot = { id: string | null; preview: string | null; progress: number | null };

function useImageSlot(initial: string | null, purpose: "avatar" | "cover") {
  const [slot, setSlot] = useState<Slot>({ id: initial, preview: null, progress: null });
  const handle = useRef<UploadHandle | null>(null);
  useEffect(() => () => handle.current?.cancel(), []);
  useEffect(() => () => {
    if (slot.preview) URL.revokeObjectURL(slot.preview);
  }, [slot.preview]);
  const pick = (file: File | undefined) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setSlot((s) => ({ ...s, preview, progress: 0 }));
    const h = uploadMedia(file, { purpose, onProgress: (p) => setSlot((s) => ({ ...s, progress: p })) });
    handle.current = h;
    h.promise
      .then((m) => setSlot((s) => ({ ...s, id: m.id, progress: null })))
      .catch((err) => {
        setSlot((s) => ({ ...s, preview: null, progress: null }));
        if ((err as { code?: string }).code !== "cancelled") toast.error(errorMessage(err));
      })
      .finally(() => {
        handle.current = null;
      });
  };
  return {
    slot,
    pick,
    cancel: () => handle.current?.cancel(),
    clear: () => setSlot({ id: null, preview: null, progress: null }),
  };
}

function FilePicker({ label, onPick, disabled, children }: { label: string; onPick: (f: File | undefined) => void; disabled?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        aria-label={label}
        tabIndex={-1}
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => ref.current?.click()}>
        {children}
      </Button>
    </>
  );
}

/** Edit display name, bio, avatar, cover and privacy. */
export function EditProfileDialog({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: Profile }) {
  const queryClient = useQueryClient();
  const config = useAppConfig();
  const [name, setName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio);
  const [isPrivate, setIsPrivate] = useState(profile.is_private);
  const [nameError, setNameError] = useState<string | null>(null);
  const avatar = useImageSlot(profile.avatar_media_id, "avatar");
  const cover = useImageSlot(profile.cover_media_id, "cover");
  const uploading = avatar.slot.progress !== null || cover.slot.progress !== null;
  const uploads = config.data?.features.uploads ?? false;

  const save = useMutation({
    mutationFn: () => {
      const patch: Record<string, unknown> = {};
      if (name.trim() !== profile.display_name) patch.displayName = name.trim();
      if (bio !== profile.bio) patch.bio = bio;
      if (isPrivate !== profile.is_private) patch.isPrivate = isPrivate;
      if (avatar.slot.id !== profile.avatar_media_id) patch.avatarMediaId = avatar.slot.id;
      if (cover.slot.id !== profile.cover_media_id) patch.coverMediaId = cover.slot.id;
      return api.patch<Profile>("/api/profiles/me", patch);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.me }),
        queryClient.invalidateQueries({ queryKey: qk.profile(profile.username) }),
      ]);
      toast.success("Profile updated");
      onClose();
    },
  });

  const coverSrc = cover.slot.preview ?? mediaUrl(cover.slot.id);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title="Edit profile"
      className="sm:max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="gradient"
            loading={save.isPending}
            disabled={uploading}
            onClick={() => {
              const r = displayNameSchema.safeParse(name);
              if (!r.success) return setNameError(r.error.issues[0]?.message ?? "Required");
              setNameError(null);
              save.mutate();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="relative h-32 overflow-hidden rounded-2xl bg-surface-2">
            {coverSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="brand-gradient h-full w-full opacity-80" />
            )}
            {cover.slot.progress !== null ? <UploadOverlay progress={cover.slot.progress} onCancel={cover.cancel} /> : null}
          </div>
          <div className="-mt-10 flex items-end justify-between gap-3 px-3">
            <div className="relative rounded-full bg-surface p-1">
              {avatar.slot.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar.slot.preview} alt="" className="h-20 w-20 rounded-full object-cover" />
              ) : (
                <Avatar mediaId={avatar.slot.id} name={name || profile.username} size="xl" />
              )}
              {avatar.slot.progress !== null ? <UploadOverlay round progress={avatar.slot.progress} onCancel={avatar.cancel} /> : null}
            </div>
          </div>
          {uploads ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <FilePicker label="Choose profile photo" onPick={avatar.pick} disabled={uploading}>
                <Camera className="h-4 w-4" /> Photo
              </FilePicker>
              {avatar.slot.id ? (
                <Button variant="ghost" size="sm" onClick={avatar.clear} disabled={uploading}>
                  <Trash2 className="h-4 w-4" /> Remove photo
                </Button>
              ) : null}
              <FilePicker label="Choose cover image" onPick={cover.pick} disabled={uploading}>
                <ImagePlus className="h-4 w-4" /> Cover
              </FilePicker>
              {cover.slot.id ? (
                <Button variant="ghost" size="sm" onClick={cover.clear} disabled={uploading}>
                  <Trash2 className="h-4 w-4" /> Remove cover
                </Button>
              ) : null}
            </div>
          ) : config.isPending ? null : (
            <div className="mt-3">
              <SetupNotice feature="Photo uploads" />
            </div>
          )}
        </div>
        <Field label="Display name" error={nameError}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />}
        </Field>
        <Field label="Bio" hint={`${bio.length}/300`}>
          {(p) => <Textarea {...p} value={bio} onChange={(e) => setBio(e.target.value.slice(0, 300))} placeholder="Tell people a little about yourself" />}
        </Field>
        <Switch
          checked={isPrivate}
          onChange={setIsPrivate}
          label="Private account"
          description="Only friends can see your cover, friends list, posts and follow you."
        />
      </div>
    </Dialog>
  );
}

function UploadOverlay({ progress, onCancel, round }: { progress: number; onCancel: () => void; round?: boolean }) {
  return (
    <div className={cn("absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 text-xs font-bold text-white", round && "rounded-full")}>
      <Loader2 className="h-5 w-5 animate-spin" />
      {Math.round(progress * 100)}%
      {!round ? (
        <button type="button" onClick={onCancel} className="mt-1 rounded-full bg-white/20 px-2 py-0.5 hover:bg-white/30">
          Cancel
        </button>
      ) : null}
    </div>
  );
}

const REASONS: Record<string, string> = {
  snap_sent: "Sent a Snap",
  snap_opened: "Opened a Snap",
  story_posted: "Posted a Story",
  streak_day: "Kept a streak going",
  admin_adjust: "Adjustment",
};

/** Your own Snap score history (rpc score_history). */
export function ScoreHistoryDialog({ open, onClose, score }: { open: boolean; onClose: () => void; score: number | null }) {
  const history = useQuery({
    queryKey: [...qk.score, "history"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient().rpc("score_history", { p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as { delta: number; reason: string; created_at: string }[];
    },
  });
  return (
    <Dialog open={open} onClose={onClose} variant="sheet" title="Snap score" description="Earned by sending and opening Snaps, posting Stories and keeping streaks.">
      <div className="mb-4 rounded-2xl bg-brand-soft p-4 text-center">
        <p className="font-display text-4xl font-extrabold text-brand">{(score ?? 0).toLocaleString()}</p>
        <p className="text-xs font-semibold text-muted">Total score</p>
      </div>
      {history.isPending ? (
        <ListSkeleton rows={4} />
      ) : history.isError ? (
        <ErrorState onRetry={() => void history.refetch()} />
      ) : history.data.length === 0 ? (
        <EmptyState icon={<TrendingUp />} title="No points yet" description="Send a Snap or post a Story to start earning." />
      ) : (
        <ul className="divide-y divide-border">
          {history.data.map((h, i) => (
            <li key={i} className="flex items-center justify-between py-2.5 text-sm">
              <span>
                <span className="block font-semibold">{REASONS[h.reason] ?? h.reason}</span>
                <span className="text-xs text-muted">{format(new Date(h.created_at), "d MMM yyyy, HH:mm")}</span>
              </span>
              <span className={cn("font-bold", h.delta >= 0 ? "text-success" : "text-danger")}>
                {h.delta >= 0 ? "+" : ""}
                {h.delta}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** Friends you have in common (rpc mutual_friends). */
export function MutualFriendsDialog({ open, onClose, userId, name }: { open: boolean; onClose: () => void; userId: string; name: string }) {
  const list = useQuery({
    queryKey: ["mutual-friends", userId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient().rpc("mutual_friends", { p_other: userId, p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as UserCard[];
    },
  });
  return (
    <Dialog open={open} onClose={onClose} variant="sheet" title="Mutual friends" description={`Friends you and ${name} have in common`}>
      {list.isPending ? (
        <ListSkeleton rows={3} />
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={<Users />} title="No mutual friends" />
      ) : (
        <ul className="space-y-0.5">
          {list.data.map((u) => (
            <li key={u.id}>
              <Link href={`/profile/${u.username}`} onClick={onClose} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-surface-2">
                <Avatar mediaId={u.avatar_media_id} name={displayName(u)} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{displayName(u)}</span>
                  <span className="block truncate text-xs text-muted">@{u.username}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

