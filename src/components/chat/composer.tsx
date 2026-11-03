"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  Contact, FileText, Film, Image as ImageIcon, Loader2, Lock, MapPin, Mic, Paperclip, Pencil, Radio, Send, Smile, Sticker as StickerIcon,
  Timer, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FriendPicker } from "@/components/social/friend-picker";
import { useMe } from "@/components/providers/session-provider";
import { useAppConfig } from "@/hooks/use-app-config";
import { api, errorMessage } from "@/lib/api/client";
import { baseMime, MIME_KIND, validateUpload } from "@/lib/media-rules";
import { cn, firstUrl, formatBytes, formatDuration } from "@/lib/utils";
import type { MediaMode } from "@/types/models";
import type { ChatMessage, LinkPreview, ReplyPreview } from "./types";
import { patchMessage, previewText, upsertMessage, type Draft } from "./use-chat";
import { EmojiPicker } from "./emoji-picker";
import { StickerPicker } from "./stickers";
import { liveLocation } from "./live-location";

type Staged = { id: string; file: File; url: string; kind: "image" | "video" | "audio" | "document"; gif: boolean };

const MEDIA_MODES: { value: MediaMode; label: string; hint: string; icon: typeof Lock | null }[] = [
  { value: "normal", label: "Normal", hint: "Can be saved and forwarded", icon: null },
  { value: "view_once", label: "View once", hint: "Opens one time, then it's gone", icon: null },
  { value: "protected", label: "Protected", hint: "No download or forwarding, watermarked", icon: Lock },
  { value: "disappearing", label: "24h", hint: "Deleted for everyone after 24 hours", icon: Timer },
];

/** Photo/video protection choice shown while photos or videos are staged. */
function MediaModePicker({ value, onChange }: { value: MediaMode; onChange: (m: MediaMode) => void }) {
  const current = MEDIA_MODES.find((m) => m.value === value) ?? MEDIA_MODES[0];
  return (
    <div className="px-3 pt-2">
      <div role="radiogroup" aria-label="Photo and video protection" className="flex flex-wrap gap-1.5">
        {MEDIA_MODES.map(({ value: v, label, icon: Icon }) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              value === v ? "border-brand bg-brand text-white" : "border-border text-ink-2 hover:bg-surface-2",
            )}
          >
            {v === "view_once" ? <span className="text-[11px] font-extrabold">1</span> : Icon ? <Icon className="h-3 w-3" /> : null}
            {label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted">{current.hint}</p>
    </div>
  );
}

const DOC_ACCEPT = Object.keys(MIME_KIND).filter((m) => MIME_KIND[m] === "document").join(",");

function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mp4;codecs=mp4a.40.2"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Voice recorder
// ---------------------------------------------------------------------------
function VoiceRecorder({ onDone, onCancel }: { onDone: (blob: Blob, durationMs: number) => void; onCancel: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const discard = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let alive = true;
    const mime = pickRecorderMime();
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      const t = window.setTimeout(() => setError("Voice recording isn't supported in this browser."), 0);
      return () => window.clearTimeout(t);
    }
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((s) => {
        if (!alive) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        const rec = new MediaRecorder(s, { mimeType: mime });
        recorder.current = rec;
        rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        rec.onstop = () => {
          s.getTracks().forEach((t) => t.stop());
          if (discard.current) return;
          const blob = new Blob(chunks.current, { type: baseMime(mime) });
          onDone(blob, Date.now() - started.current);
        };
        started.current = Date.now();
        rec.start(250);
        timer = window.setInterval(() => {
          const ms = Date.now() - started.current;
          setElapsed(ms);
          if (ms > 5 * 60_000) rec.stop();
        }, 200);
      })
      .catch(() => setError("Microphone access was denied. Allow it in your browser settings to record."));
    return () => {
      alive = false;
      window.clearInterval(timer);
      discard.current = discard.current || recorder.current?.state === "recording";
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
    // onDone is stable for the lifetime of a recording.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-between gap-2 rounded-2xl bg-danger-soft px-3 py-2 text-sm text-danger">
        {error}
        <button type="button" onClick={onCancel} className="font-bold" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-1 items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2" role="status" aria-live="polite">
      <button
        type="button"
        onClick={() => {
          discard.current = true;
          recorder.current?.stop();
          onCancel();
        }}
        className="rounded-full p-2 text-danger hover:bg-danger-soft"
        aria-label="Cancel recording"
      >
        <Trash2 className="h-5 w-5" />
      </button>
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" aria-hidden />
      <span className="flex-1 text-sm font-semibold tabular-nums">Recording {formatDuration(elapsed / 1000)}</span>
      <Button size="icon" variant="gradient" aria-label="Send voice message" onClick={() => recorder.current?.state === "recording" && recorder.current.stop()}>
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Location dialog
// ---------------------------------------------------------------------------
function LocationDialog({ conversationId, onClose, onStatic }: { conversationId: string; onClose: () => void; onStatic: (lat: number, lng: number, accuracy: number) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const qc = useQueryClient();

  const getPosition = () =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Location isn't available on this device."));
      navigator.geolocation.getCurrentPosition(resolve, (err) =>
        reject(new Error(err.code === err.PERMISSION_DENIED ? "Location permission was denied." : "Couldn't get your location.")),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 });
    });

  const shareStatic = async () => {
    setBusy("static");
    try {
      const pos = await getPosition();
      onStatic(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const shareLive = async (minutes: 15 | 60 | 480) => {
    setBusy(String(minutes));
    try {
      const pos = await getPosition();
      const msg = await api.post<ChatMessage>("/api/location", {
        conversationId,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        minutes,
      });
      upsertMessage(qc, conversationId, msg);
      const meta = msg.metadata as { share_id?: string; expires_at?: string };
      if (meta.share_id && meta.expires_at) liveLocation.start(meta.share_id, conversationId, meta.expires_at);
      toast.success("Sharing your live location");
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onClose={onClose} variant="sheet" title="Share location">
      <p className="mb-4 rounded-2xl bg-surface-2 p-3 text-sm text-ink-2">
        Your browser will ask for permission. A one-time share sends your current position once. Live location sends updates
        (at most every 10 seconds) only to this chat, only while Quick Chat is open, and stops automatically when the time is up —
        you can stop it any time.
      </p>
      <div className="space-y-2">
        <Button variant="outline" className="w-full justify-start" loading={busy === "static"} disabled={Boolean(busy)} onClick={shareStatic}>
          <MapPin className="h-4 w-4" /> Send current location
        </Button>
        <p className="pt-2 text-xs font-bold uppercase tracking-wide text-muted">Share live location for</p>
        <div className="grid grid-cols-3 gap-2">
          {([15, 60, 480] as const).map((m) => (
            <Button key={m} variant="secondary" loading={busy === String(m)} disabled={Boolean(busy)} onClick={() => shareLive(m)}>
              <Radio className="h-4 w-4" /> {m === 15 ? "15 min" : m === 60 ? "1 hour" : "8 hours"}
            </Button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------------
export function Composer({
  conversationId,
  replyTo,
  replyLabel,
  onCancelReply,
  editing,
  onCancelEdit,
  onSend,
  onTyping,
  disabledReason,
}: {
  conversationId: string;
  replyTo: ReplyPreview | null;
  replyLabel: string | null;
  onCancelReply: () => void;
  editing: ChatMessage | null;
  onCancelEdit: () => void;
  onSend: (draft: Draft) => void;
  onTyping: (typing?: boolean) => void;
  disabledReason: string | null;
}) {
  const qc = useQueryClient();
  const config = useAppConfig();
  const uploads = config.data?.features.uploads ?? true;
  const [text, setText] = useState("");
  const [staged, setStaged] = useState<Staged[]>([]);
  const [panel, setPanel] = useState<"emoji" | "sticker" | "attach" | null>(null);
  const [recording, setRecording] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contact, setContact] = useState<string[]>([]);
  const [dismissedUrl, setDismissedUrl] = useState<string | null>(null);
  const [debouncedUrl, setDebouncedUrl] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const me = useMe();
  const [mediaMode, setMediaMode] = useState<MediaMode>(me.settings.default_media_mode ?? "normal");
  const input = useRef<HTMLTextAreaElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const gifInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const stagedRef = useRef<Staged[]>([]);
  const [prevEditing, setPrevEditing] = useState<ChatMessage | null>(null);

  // Load the message text when entering edit mode (state derived from props).
  if (editing !== prevEditing) {
    setPrevEditing(editing);
    if (editing) setText(editing.body ?? "");
  }

  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);
  useEffect(() => () => stagedRef.current.forEach((s) => URL.revokeObjectURL(s.url)), []);
  useEffect(() => {
    if (editing || replyTo) input.current?.focus();
  }, [editing, replyTo]);

  const url = editing ? null : firstUrl(text);
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedUrl(url), 600);
    return () => window.clearTimeout(t);
  }, [url]);
  const preview = useQuery({
    queryKey: ["link-preview", debouncedUrl],
    enabled: Boolean(debouncedUrl) && debouncedUrl !== dismissedUrl,
    queryFn: () => api.get<LinkPreview>("/api/messages/link-preview", { url: debouncedUrl! }),
    staleTime: 10 * 60_000,
    retry: false,
    meta: { silent: true },
  });
  const linkPreview = preview.data && preview.data && url === debouncedUrl && url !== dismissedUrl ? preview.data : null;

  const autosize = () => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const addFiles = (files: FileList | null, forceGif = false) => {
    if (!files) return;
    const next: Staged[] = [];
    for (const file of Array.from(files)) {
      const mime = baseMime(file.type);
      const check = validateUpload(mime, file.size, "message");
      if (!check.ok) {
        toast.error(`${file.name}: ${check.reason}`);
        continue;
      }
      next.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), kind: check.kind, gif: forceGif || mime === "image/gif" });
    }
    setStaged((s) => [...s, ...next].slice(0, 10));
    setPanel(null);
  };

  const removeStaged = (id: string) => {
    setStaged((s) => {
      const item = s.find((x) => x.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return s.filter((x) => x.id !== id);
    });
  };

  const submit = async () => {
    const body = text.trim();
    if (editing) {
      if (!body || body === editing.body) return onCancelEdit();
      setSavingEdit(true);
      try {
        const updated = await api.patch<ChatMessage>(`/api/messages/${editing.id}`, { body });
        patchMessage(qc, conversationId, editing.id, (m) => ({ ...m, body: updated.body, edited_at: updated.edited_at }));
        setText("");
        onCancelEdit();
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setSavingEdit(false);
      }
      return;
    }
    if (!body && staged.length === 0) return;

    if (staged.length) {
      const images = staged.filter((s) => s.kind === "image" && !s.gif);
      const others = staged.filter((s) => !(s.kind === "image" && !s.gif));
      const drafts: Draft[] = [];
      // Modes apply to photos and videos; view once is one file per message.
      const mode = mediaMode === "normal" ? undefined : mediaMode;
      const perMessage = mediaMode === "view_once" ? 1 : 10;
      for (let i = 0; i < images.length; i += perMessage) {
        drafts.push({ type: "image", mediaMode: mode, files: images.slice(i, i + perMessage).map((s) => ({ file: s.file, name: s.file.name, kind: "image" })) });
      }
      for (const s of others) {
        const type = s.gif ? "gif" : s.kind === "video" ? "video" : s.kind === "audio" ? "voice" : "document";
        drafts.push({ type, mediaMode: type === "video" ? mode : undefined, files: [{ file: s.file, name: s.file.name, kind: s.kind }] });
      }
      if (body) drafts[0] = { ...drafts[0], body };
      drafts[0] = { ...drafts[0], replyTo };
      drafts.forEach(onSend);
      staged.forEach((s) => URL.revokeObjectURL(s.url));
      // Object URLs are re-created by the outbox, so revoking staged previews is safe.
      setStaged([]);
    } else {
      const link = firstUrl(body);
      if (link) {
        const meta: Record<string, unknown> = { url: link };
        if (linkPreview && linkPreview.url) {
          meta.title = linkPreview.title;
          meta.description = linkPreview.description;
          meta.domain = linkPreview.domain;
        }
        onSend({ type: "link", body, metadata: meta, replyTo });
      } else {
        onSend({ type: "text", body, replyTo });
      }
    }
    setText("");
    setDismissedUrl(null);
    onTyping(false);
    onCancelReply();
    window.requestAnimationFrame(autosize);
  };

  if (disabledReason) {
    return <div className="border-t border-border bg-surface px-4 py-4 text-center text-sm text-muted safe-bottom">{disabledReason}</div>;
  }

  const onAttach = (key: string) => {
    if (key === "media") mediaInput.current?.click();
    else if (key === "gif") gifInput.current?.click();
    else if (key === "doc") docInput.current?.click();
    else if (key === "location") setLocationOpen(true);
    else if (key === "contact") setContactOpen(true);
    else if (key === "sticker") setPanel("sticker");
  };

  const canSend = editing ? text.trim().length > 0 : text.trim().length > 0 || staged.length > 0;

  return (
    <div className="border-t border-border bg-surface/95 backdrop-blur safe-bottom">
      <AnimatePresence initial={false}>
        {replyTo || editing ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mx-3 mt-2 flex items-center gap-3 rounded-2xl border-l-4 border-brand bg-surface-2 px-3 py-2">
              {editing ? <Pencil className="h-4 w-4 shrink-0 text-brand" /> : null}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-brand">{editing ? "Editing message" : `Replying to ${replyLabel ?? "message"}`}</p>
                <p className="truncate text-xs text-muted">
                  {editing ? editing.body : previewText(replyTo!.type, replyTo!.body, replyTo!.deleted) || "Message"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (editing) {
                    setText("");
                    onCancelEdit();
                  } else onCancelReply();
                }}
                className="rounded-full p-1.5 text-muted hover:bg-surface-3"
                aria-label={editing ? "Cancel editing" : "Cancel reply"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {linkPreview && !staged.length ? (
        <div className="mx-3 mt-2 flex items-start gap-2 rounded-2xl border-l-4 border-brand bg-surface-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase text-brand">{linkPreview.domain}</p>
            {linkPreview.title ? <p className="truncate text-sm font-semibold">{linkPreview.title}</p> : null}
            {linkPreview.description ? <p className="line-clamp-1 text-xs text-muted">{linkPreview.description}</p> : null}
          </div>
          <button type="button" onClick={() => setDismissedUrl(url)} className="rounded-full p-1 text-muted hover:bg-surface-3" aria-label="Remove link preview">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {staged.some((s) => (s.kind === "image" && !s.gif) || s.kind === "video") ? <MediaModePicker value={mediaMode} onChange={setMediaMode} /> : null}
      {staged.length ? (
        <div className="flex gap-2 overflow-x-auto px-3 pt-2 no-scrollbar" aria-label="Attachments to send">
          {staged.map((s) => (
            <div key={s.id} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-border bg-surface-2">
              {s.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.url} alt={s.file.name} className="h-full w-full object-cover" />
              ) : s.kind === "video" ? (
                <video src={s.url} muted className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 p-1 text-center">
                  <FileText className="h-6 w-6 text-brand" />
                  <span className="line-clamp-2 text-[10px] leading-tight">{s.file.name}</span>
                  <span className="text-[9px] text-muted">{formatBytes(s.file.size)}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removeStaged(s.id)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                aria-label={`Remove ${s.file.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <AnimatePresence>
        {panel === "emoji" || panel === "sticker" ? (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mx-3 mt-2 rounded-2xl border border-border bg-surface p-2">
            {panel === "emoji" ? (
              <EmojiPicker
                onSelect={(e) => {
                  setText((t) => t + e);
                  input.current?.focus();
                }}
              />
            ) : (
              <StickerPicker
                onSelect={(id) => {
                  onSend({ type: "sticker", metadata: { sticker_id: id }, replyTo });
                  onCancelReply();
                  setPanel(null);
                }}
              />
            )}
          </motion.div>
        ) : null}
        {panel === "attach" ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mx-3 mt-2 grid grid-cols-3 gap-2 rounded-2xl border border-border bg-surface p-2 sm:grid-cols-6"
            role="menu"
          >
            {[
              { key: "media", label: "Photo & video", icon: <ImageIcon />, needsUpload: true },
              { key: "gif", label: "GIF", icon: <Film />, needsUpload: true },
              { key: "doc", label: "Document", icon: <FileText />, needsUpload: true },
              { key: "location", label: "Location", icon: <MapPin />, needsUpload: false },
              { key: "contact", label: "Contact", icon: <Contact />, needsUpload: false },
              { key: "sticker", label: "Sticker", icon: <StickerIcon />, needsUpload: false },
            ]
              .filter((o) => uploads || !o.needsUpload)
              .map((o) => (
                <button
                  key={o.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (o.key !== "sticker") setPanel(null);
                    onAttach(o.key);
                  }}
                  className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-xs font-semibold text-ink-2 hover:bg-surface-2 [&>span>svg]:h-5 [&>span>svg]:w-5"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">{o.icon}</span>
                  {o.label}
                </button>
              ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex items-end gap-1.5 px-2 py-2 md:px-3">
        {recording ? (
          <VoiceRecorder
            onCancel={() => setRecording(false)}
            onDone={(blob, durationMs) => {
              setRecording(false);
              if (blob.size < 1000) return toast.message("Voice message too short.");
              onSend({ type: "voice", files: [{ file: blob, name: "voice-message", kind: "audio", durationMs }], replyTo });
              onCancelReply();
            }}
          />
        ) : (
          <>
            {!editing ? (
              <button
                type="button"
                onClick={() => setPanel((p) => (p === "attach" ? null : "attach"))}
                aria-label="Attach"
                aria-expanded={panel === "attach"}
                className={cn("rounded-full p-2.5 text-ink-2 hover:bg-surface-2", panel === "attach" && "bg-brand-soft text-brand")}
              >
                <Paperclip className="h-5 w-5" />
              </button>
            ) : null}
            <div className="flex min-w-0 flex-1 items-end rounded-3xl border border-border bg-surface-2 pl-4 pr-1 focus-within:border-brand">
              <textarea
                ref={input}
                value={text}
                rows={1}
                maxLength={4000}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                  setText(e.target.value);
                  autosize();
                  if (e.target.value) onTyping(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void submit();
                  } else if (e.key === "Escape") {
                    if (editing) {
                      setText("");
                      onCancelEdit();
                    } else if (replyTo) onCancelReply();
                  }
                }}
                onPaste={(e) => {
                  if (!uploads || editing) return;
                  const files = e.clipboardData.files;
                  if (files.length) {
                    e.preventDefault();
                    addFiles(files);
                  }
                }}
                placeholder={staged.length ? "Add a caption…" : "Message"}
                aria-label="Message"
                className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-3 text-[15px] outline-none placeholder:text-muted"
              />
              <button
                type="button"
                onClick={() => setPanel((p) => (p === "emoji" ? null : "emoji"))}
                aria-label="Emoji"
                aria-expanded={panel === "emoji"}
                className={cn("mb-1 rounded-full p-2 text-muted hover:text-ink", panel === "emoji" && "text-brand")}
              >
                <Smile className="h-5 w-5" />
              </button>
            </div>
            {canSend || editing || !uploads ? (
              <Button size="icon" variant="gradient" aria-label={editing ? "Save edit" : "Send"} disabled={!canSend || savingEdit} onClick={() => void submit()}>
                {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            ) : (
              <Button size="icon" variant="gradient" aria-label="Record voice message" onClick={() => setRecording(true)}>
                <Mic className="h-5 w-5" />
              </Button>
            )}
          </>
        )}
      </div>

      <input ref={mediaInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm,video/quicktime" multiple hidden onChange={(e) => {
        addFiles(e.target.files);
        e.target.value = "";
      }} />
      <input ref={gifInput} type="file" accept="image/gif" multiple hidden onChange={(e) => {
        addFiles(e.target.files, true);
        e.target.value = "";
      }} />
      <input ref={docInput} type="file" accept={`${DOC_ACCEPT},audio/*`} multiple hidden onChange={(e) => {
        addFiles(e.target.files);
        e.target.value = "";
      }} />

      {locationOpen ? (
        <LocationDialog
          conversationId={conversationId}
          onClose={() => setLocationOpen(false)}
          onStatic={(lat, lng, accuracy) => onSend({ type: "location", metadata: { lat, lng, accuracy: Math.round(accuracy) }, replyTo })}
        />
      ) : null}
      {contactOpen ? (
        <Dialog
          open
          onClose={() => setContactOpen(false)}
          variant="sheet"
          title="Share a contact"
          footer={
            <>
              <Button variant="ghost" onClick={() => setContactOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!contact.length}
                onClick={() => {
                  onSend({ type: "contact", metadata: { user_id: contact[0] }, replyTo });
                  setContact([]);
                  setContactOpen(false);
                }}
              >
                Send
              </Button>
            </>
          }
        >
          <FriendPicker selected={contact} onChange={(ids) => setContact(ids.slice(-1))} className="h-80" />
        </Dialog>
      ) : null}
    </div>
  );
}
