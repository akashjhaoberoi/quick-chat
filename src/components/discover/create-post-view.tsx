"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Lock, Globe, X } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { SetupNotice, Spinner } from "@/components/ui/feedback";
import { useAppConfig } from "@/hooks/use-app-config";
import { api, errorMessage } from "@/lib/api/client";
import { uploadMedia, type UploadHandle } from "@/lib/upload";
import { cn } from "@/lib/utils";

const MAX = 500;

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; progress: number }
  | { status: "done"; mediaId: string }
  | { status: "error"; message: string };

export function CreatePostView() {
  const router = useRouter();
  const qc = useQueryClient();
  const config = useAppConfig();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [upload, setUpload] = useState<UploadState>({ status: "idle" });
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<"public" | "followers">("public");
  const handleRef = useRef<UploadHandle | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => handleRef.current?.cancel(), []);
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const start = (f: File) => {
    handleRef.current?.cancel();
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setUpload({ status: "uploading", progress: 0 });
    const handle = uploadMedia(f, { purpose: "post", onProgress: (p) => setUpload({ status: "uploading", progress: p }) });
    handleRef.current = handle;
    handle.promise
      .then((m) => handleRef.current === handle && setUpload({ status: "done", mediaId: m.id }))
      .catch((e) => {
        if (handleRef.current !== handle) return;
        if ((e as { code?: string }).code === "cancelled") clear();
        else setUpload({ status: "error", message: errorMessage(e) });
      });
  };

  const clear = () => {
    handleRef.current?.cancel();
    handleRef.current = null;
    setFile(null);
    setPreview(null);
    setUpload({ status: "idle" });
  };

  const publish = useMutation({
    mutationFn: () => {
      if (upload.status !== "done") throw new Error("Upload isn't finished yet.");
      return api.post<{ id: string }>("/api/discover/posts", { mediaId: upload.mediaId, caption: caption.trim(), visibility });
    },
    onSuccess: ({ id }) => {
      handleRef.current = null;
      void qc.invalidateQueries({ queryKey: ["discover"] });
      router.replace(`/discover/${id}`);
    },
  });

  if (config.isPending) {
    return (
      <div className="flex justify-center p-10">
        <Spinner />
      </div>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="New post" subtitle="Share a photo or video on Discover" back="/discover" />
      <div className="space-y-5 px-4 pb-10 md:px-6">
        {!config.data?.features.uploads ? (
          <SetupNotice feature="Media uploads">Posting needs media storage (Cloudflare R2 or Supabase Storage). An administrator needs to configure it — see docs/SETUP.md.</SetupNotice>
        ) : (
          <>
            {!file ? (
              <label className="flex aspect-[9/12] max-h-[60dvh] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border bg-surface-2 text-center hover:border-brand sm:aspect-video">
                <ImagePlus className="h-10 w-10 text-brand" aria-hidden />
                <span className="font-semibold">Choose a photo or video</span>
                <span className="text-xs text-muted">JPG, PNG, WebP, GIF, MP4, WebM or MOV · videos up to 100 MB</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/heic,video/mp4,video/webm,video/quicktime"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) start(f);
                    e.target.value = "";
                  }}
                />
              </label>
            ) : (
              <div className="relative mx-auto aspect-[9/16] max-h-[60dvh] overflow-hidden rounded-3xl bg-black">
                {file.type.startsWith("video/") ? (
                  <video src={preview ?? undefined} className="h-full w-full object-contain" controls muted playsInline />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview ?? undefined} alt="Selected media preview" className="h-full w-full object-contain" />
                )}
                <button type="button" onClick={clear} aria-label="Remove media" className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white">
                  <X className="h-5 w-5" />
                </button>
                {upload.status === "uploading" ? (
                  <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/60 p-3 text-white backdrop-blur">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>Uploading… {Math.round(upload.progress * 100)}%</span>
                      <button type="button" onClick={clear} className="underline">
                        Cancel
                      </button>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuenow={Math.round(upload.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${upload.progress * 100}%` }} />
                    </div>
                  </div>
                ) : upload.status === "error" ? (
                  <div role="alert" className="absolute inset-x-3 bottom-3 rounded-2xl bg-danger p-3 text-sm text-white">
                    {upload.message}{" "}
                    <button type="button" className="font-bold underline" onClick={() => start(file)}>
                      Retry
                    </button>
                  </div>
                ) : null}
              </div>
            )}

            <div>
              <label htmlFor="caption" className="mb-1.5 block text-sm font-semibold text-ink-2">
                Caption
              </label>
              <div className="relative rounded-xl border border-border bg-surface focus-within:border-brand focus-within:ring-4 focus-within:ring-[var(--ring)]">
                <div ref={backdropRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words px-3.5 py-2.5 text-sm text-ink">
                  {caption.split(/(#[A-Za-z0-9_]{1,40})/g).map((part, i) =>
                    /^#[A-Za-z0-9_]{1,40}$/.test(part) ? (
                      <span key={i} className="rounded bg-brand-soft text-brand">
                        {part}
                      </span>
                    ) : (
                      <span key={i}>{part}</span>
                    ),
                  )}
                  {"\n"}
                </div>
                <textarea
                  id="caption"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value.slice(0, MAX))}
                  onScroll={(e) => {
                    if (backdropRef.current) backdropRef.current.scrollTop = e.currentTarget.scrollTop;
                  }}
                  maxLength={MAX}
                  rows={4}
                  placeholder="Say something… add #hashtags so people can find it"
                  className="relative block min-h-28 w-full resize-none bg-transparent px-3.5 py-2.5 text-sm text-transparent caret-ink placeholder:text-muted focus:outline-none"
                />
              </div>
              <p className={cn("mt-1 text-right text-xs", caption.length > MAX - 20 ? "text-warning" : "text-muted")}>
                {caption.length}/{MAX}
              </p>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink-2">Who can see this?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { value: "public", label: "Everyone", hint: "Shown in Discover for all users", Icon: Globe },
                    { value: "followers", label: "Followers", hint: "Only people who follow you", Icon: Lock },
                  ] as const
                ).map(({ value, label, hint, Icon }) => (
                  <label
                    key={value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-2xl border p-3",
                      visibility === value ? "border-brand bg-brand-soft" : "border-border hover:bg-surface-2",
                    )}
                  >
                    <input type="radio" name="visibility" value={value} checked={visibility === value} onChange={() => setVisibility(value)} className="sr-only" />
                    <Icon className="mt-0.5 h-5 w-5 text-brand" aria-hidden />
                    <span>
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="block text-xs text-muted">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Button
              variant="gradient"
              size="lg"
              className="w-full"
              disabled={upload.status !== "done"}
              loading={publish.isPending}
              onClick={() => publish.mutate()}
            >
              {upload.status === "uploading" ? "Waiting for upload…" : "Publish"}
            </Button>
          </>
        )}
      </div>
    </PageContainer>
  );
}
