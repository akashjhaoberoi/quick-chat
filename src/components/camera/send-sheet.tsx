"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowLeft, Check, Globe, Lock, Send, Sparkles, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { SetupNotice } from "@/components/ui/feedback";
import { FriendPicker, useFriends } from "@/components/social/friend-picker";
import { useMe } from "@/components/providers/session-provider";
import { useAppConfig } from "@/hooks/use-app-config";
import { api, ClientApiError, errorMessage } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { uploadMedia, type UploadHandle } from "@/lib/upload";
import { qk } from "@/lib/query-keys";
import { cn, displayName } from "@/lib/utils";
import type { StoryAudience } from "@/types/models";
import type { EditedMedia } from "./media-editor";

const VIEW_TIMES = [3, 5, 10, 30] as const;
const EXPIRIES = [
  { hours: 1, label: "1 hour" },
  { hours: 6, label: "6 hours" },
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
] as const;

type FriendList = { id: string; name: string; friend_list_members: { count: number }[] };
type Phase = "form" | "uploading" | "done";
export type SendResult = { snapId: string | null; storyId: string | null };

function useFriendLists() {
  return useQuery({
    queryKey: qk.friendLists,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient()
        .from("friend_lists")
        .select("id, name, friend_list_members(count)")
        .order("name");
      if (error) throw error;
      return (data ?? []) as FriendList[];
    },
  });
}

export function SendSheet({
  media,
  initialRecipients,
  initialStory,
  onBack,
  onSent,
}: {
  media: EditedMedia;
  initialRecipients: string[];
  initialStory: boolean;
  onBack: () => void;
  onSent: (result: SendResult) => void;
}) {
  const me = useMe();
  const queryClient = useQueryClient();
  const config = useAppConfig();
  const friends = useFriends();
  const lists = useFriendLists();

  const [recipients, setRecipients] = useState<string[]>(initialRecipients);
  const [toStory, setToStory] = useState(initialStory);
  const [audience, setAudience] = useState<StoryAudience>(me.settings.story_default_audience ?? "friends");
  const [customMode, setCustomMode] = useState<"pick" | "list">("pick");
  const [customIds, setCustomIds] = useState<string[]>([]);
  const [friendListId, setFriendListId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [viewTime, setViewTime] = useState<(typeof VIEW_TIMES)[number]>(10);
  const [viewOnce, setViewOnce] = useState(true);
  const [allowReplay, setAllowReplay] = useState(false);
  const [expireHours, setExpireHours] = useState<(typeof EXPIRIES)[number]["hours"]>(24);
  const [phase, setPhase] = useState<Phase>("form");
  const [progress, setProgress] = useState<number[]>([]);
  const [stage, setStage] = useState<"upload" | "post">("upload");
  const handles = useRef<UploadHandle[]>([]);

  const uploadsDisabled = config.data?.features.uploads === false;
  const customReady = audience !== "custom" || (customMode === "pick" ? customIds.length > 0 : Boolean(friendListId));
  const canSend = (recipients.length > 0 || (toStory && customReady)) && !uploadsDisabled && phase === "form";
  const overallProgress = progress.length ? progress.reduce((a, b) => a + b, 0) / progress.length : 0;

  const recipientNames = (friends.data ?? []).filter((f) => recipients.includes(f.id)).map((f) => displayName(f));

  const send = async () => {
    if (!canSend) return;
    const snapNeeded = recipients.length > 0;
    const purposes = [...(snapNeeded ? (["snap"] as const) : []), ...(toStory ? (["story"] as const) : [])];
    setPhase("uploading");
    setStage("upload");
    setProgress(purposes.map(() => 0));

    // A media asset belongs to exactly one snap or story, with a matching
    // purpose — so sending to both uploads the file twice.
    handles.current = purposes.map((purpose, i) =>
      uploadMedia(media.blob, {
        purpose,
        compress: false,
        width: media.width,
        height: media.height,
        durationMs: media.kind === "video" ? media.durationMs : undefined,
        onProgress: (f) => setProgress((p) => p.map((v, j) => (j === i ? f : v))),
      }),
    );

    let uploaded: { id: string }[];
    try {
      uploaded = await Promise.all(handles.current.map((h) => h.promise));
    } catch (err) {
      handles.current.forEach((h) => h.cancel());
      handles.current = [];
      setPhase("form");
      if (!(err instanceof ClientApiError && err.code === "cancelled")) toast.error(errorMessage(err));
      return;
    }
    handles.current = [];
    setStage("post");

    const overlays = media.kind === "video" ? media.overlays : [];
    const result: SendResult = { snapId: null, storyId: null };
    const errors: string[] = [];
    let i = 0;
    if (snapNeeded) {
      try {
        const r = await api.post<{ id: string }>("/api/snaps", {
          mediaId: uploaded[i].id,
          recipientIds: recipients,
          durationSeconds: viewTime,
          viewOnce,
          allowReplay: !viewOnce && allowReplay,
          caption: caption.trim(),
          overlays,
          expireHours,
        });
        result.snapId = r.id;
      } catch (err) {
        errors.push(`Snap: ${errorMessage(err)}`);
      }
      i++;
    }
    if (toStory) {
      try {
        const r = await api.post<{ id: string }>("/api/stories", {
          mediaId: uploaded[i].id,
          caption: caption.trim(),
          overlays,
          audience,
          customIds: audience === "custom" && customMode === "pick" ? customIds : undefined,
          friendListId: audience === "custom" && customMode === "list" ? (friendListId ?? undefined) : undefined,
        });
        result.storyId = r.id;
      } catch (err) {
        errors.push(`Story: ${errorMessage(err)}`);
      }
    }

    void queryClient.invalidateQueries({ queryKey: ["snaps"] });
    void queryClient.invalidateQueries({ queryKey: ["stories"] });
    void queryClient.invalidateQueries({ queryKey: qk.streaks });
    void queryClient.invalidateQueries({ queryKey: qk.score });

    if (!result.snapId && !result.storyId) {
      errors.forEach((e) => toast.error(e));
      setPhase("form");
      return;
    }
    errors.forEach((e) => toast.error(e));
    setPhase("done");
    window.setTimeout(() => onSent(result), 1100);
  };

  const cancel = () => {
    handles.current.forEach((h) => h.cancel());
  };

  return (
    <div className="relative flex h-full w-full flex-col bg-bg text-ink">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onBack} disabled={phase !== "form"} className="rounded-full p-2 text-ink-2 hover:bg-surface-2 disabled:opacity-40" aria-label="Back to editor">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 font-display text-lg font-bold">Send to…</h1>
        <div className="h-12 w-9 overflow-hidden rounded-lg bg-surface-3">
          {media.kind === "image" ? (
            // Local object URL of the user's own edited photo.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.previewUrl} alt="Your edited photo" className="h-full w-full object-cover" />
          ) : (
            <video src={media.previewUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-label="Your video" />
          )}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 pb-32 scrollbar-thin">
        {uploadsDisabled ? <SetupNotice feature="Media storage" /> : null}

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink-2">Caption (optional)</span>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={250}
            placeholder="Say something about it"
            className="h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]"
          />
        </label>

        {/* My Story */}
        <section className={cn("rounded-3xl border bg-surface p-4 transition-colors", toStory ? "border-brand" : "border-border")}>
          <button type="button" onClick={() => setToStory((v) => !v)} aria-pressed={toStory} className="flex w-full items-center gap-3 text-left">
            <span className="story-ring flex h-11 w-11 items-center justify-center rounded-full text-white">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">My Story</span>
              <span className="block text-xs text-muted">Visible for 24 hours</span>
            </span>
            <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2", toStory ? "border-brand bg-brand text-white" : "border-border")}>
              {toStory ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
            </span>
          </button>
          {toStory ? (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Story audience">
                {(
                  [
                    { v: "friends", label: "Friends", icon: Users },
                    { v: "public", label: "Public", icon: Globe },
                    { v: "custom", label: "Custom", icon: Lock },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={audience === o.v}
                    onClick={() => setAudience(o.v)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-2xl border py-2.5 text-xs font-bold",
                      audience === o.v ? "border-brand bg-brand-soft text-brand" : "border-border text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    <o.icon className="h-4 w-4" />
                    {o.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted">
                {audience === "friends"
                  ? "Only your friends can see this story."
                  : audience === "public"
                    ? "Anyone who can see your profile can view it, and it can appear in public stories."
                    : "Only the people you choose can see it."}
              </p>
              {audience === "custom" ? (
                <div className="space-y-3">
                  <div className="flex gap-1 rounded-2xl bg-surface-2 p-1" role="tablist" aria-label="Custom audience source">
                    {(["pick", "list"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="tab"
                        aria-selected={customMode === m}
                        onClick={() => setCustomMode(m)}
                        className={cn("flex-1 rounded-xl py-1.5 text-xs font-bold", customMode === m ? "bg-surface shadow-sm" : "text-muted")}
                      >
                        {m === "pick" ? "Choose friends" : "Friend list"}
                      </button>
                    ))}
                  </div>
                  {customMode === "pick" ? (
                    <FriendPicker selected={customIds} onChange={setCustomIds} className="max-h-64" />
                  ) : lists.isPending ? (
                    <p className="text-sm text-muted">Loading your lists…</p>
                  ) : (lists.data ?? []).length === 0 ? (
                    <p className="rounded-2xl bg-surface-2 p-3 text-sm text-muted">You haven&apos;t created any friend lists yet. Create one from the Friends page, or choose friends instead.</p>
                  ) : (
                    <div className="space-y-1.5" role="radiogroup" aria-label="Friend list">
                      {(lists.data ?? []).map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          role="radio"
                          aria-checked={friendListId === l.id}
                          onClick={() => setFriendListId(l.id)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-sm font-semibold",
                            friendListId === l.id ? "border-brand bg-brand-soft" : "border-border hover:bg-surface-2",
                          )}
                        >
                          {l.name}
                          <span className="text-xs text-muted">{l.friend_list_members?.[0]?.count ?? 0} people</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* Friends */}
        <section className="rounded-3xl border border-border bg-surface p-4">
          <h2 className="mb-3 flex items-center justify-between font-semibold">
            Friends
            {recipients.length ? <span className="text-xs font-bold text-brand">{recipients.length} selected</span> : null}
          </h2>
          <FriendPicker selected={recipients} onChange={setRecipients} max={50} className="max-h-72" />
        </section>

        {/* Snap options */}
        {recipients.length > 0 ? (
          <section className="space-y-1 rounded-3xl border border-border bg-surface p-4">
            <h2 className="font-semibold">Snap options</h2>
            {media.kind === "image" ? (
              <div className="py-2">
                <p className="mb-2 text-sm font-semibold">View time</p>
                <div className="flex gap-2" role="radiogroup" aria-label="View time">
                  {VIEW_TIMES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={viewTime === t}
                      onClick={() => setViewTime(t)}
                      className={cn("flex-1 rounded-xl py-2 text-sm font-bold", viewTime === t ? "bg-brand text-white" : "bg-surface-2 text-ink-2")}
                    >
                      {t}s
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-2 text-sm text-muted">Video Snaps play once for their full length ({Math.round(media.durationMs / 1000)}s).</p>
            )}
            <Switch
              checked={viewOnce}
              onChange={(v) => {
                setViewOnce(v);
                if (v) setAllowReplay(false);
              }}
              label="View once"
              description="The Snap can be opened a single time."
            />
            <Switch
              checked={allowReplay}
              onChange={setAllowReplay}
              disabled={viewOnce}
              label="Allow one replay"
              description={viewOnce ? "Turn off “View once” to allow a replay." : "Friends can replay it once within 24 hours of opening."}
            />
            <div className="pt-2">
              <p className="mb-2 text-sm font-semibold">Delete if unopened after</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Unopened expiry">
                {EXPIRIES.map((e) => (
                  <button
                    key={e.hours}
                    type="button"
                    role="radio"
                    aria-checked={expireHours === e.hours}
                    onClick={() => setExpireHours(e.hours)}
                    className={cn("rounded-xl px-3 py-2 text-xs font-bold", expireHours === e.hours ? "bg-brand text-white" : "bg-surface-2 text-ink-2")}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="pt-3 text-xs text-muted">
              Snaps disappear after viewing — the server stops serving the media once the view window closes. Screenshot alerts are best-effort only: browsers can&apos;t reliably detect screenshots.
            </p>
          </section>
        ) : null}
      </div>

      {/* Send bar */}
      <div className="absolute inset-x-0 bottom-0 border-t border-border bg-surface/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        {phase === "uploading" ? (
          <div className="flex items-center gap-3" role="status" aria-live="polite">
            <div className="min-w-0 flex-1">
              <p className="mb-1.5 text-sm font-semibold">
                {stage === "upload" ? `Uploading… ${Math.round(overallProgress * 100)}%` : "Sending…"}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                <motion.div className="brand-gradient h-full" animate={{ width: `${stage === "upload" ? overallProgress * 100 : 100}%` }} transition={{ ease: "easeOut" }} />
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={cancel} disabled={stage !== "upload"}>
              <X className="h-4 w-4" /> Cancel
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-sm text-ink-2">
              {[toStory ? "My Story" : null, ...recipientNames].filter(Boolean).join(", ") || "Choose friends or My Story"}
            </p>
            <Button variant="gradient" size="lg" onClick={() => void send()} disabled={!canSend} aria-label="Send">
              Send <Send className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {phase === "done" ? (
          <motion.div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-bg/90 backdrop-blur"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            role="status"
          >
            <motion.span
              className="brand-gradient flex h-24 w-24 items-center justify-center rounded-full text-white shadow-[var(--shadow-pop)]"
              initial={{ scale: 0.3, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 18 }}
            >
              <Check className="h-12 w-12" strokeWidth={3} />
            </motion.span>
            <p className="font-display text-xl font-bold">Sent!</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
