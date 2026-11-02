"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Camera, CameraOff, ImageUp, Loader2, MicOff, RefreshCcw, Timer, X, Zap, ZapOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mediaDimensions } from "@/lib/upload";
import { validateUpload } from "@/lib/media-rules";
import { cn } from "@/lib/utils";

export type Captured =
  | { kind: "image"; bitmap: ImageBitmap; origin: "camera" | "upload" }
  | { kind: "video"; blob: Blob; durationMs: number; width?: number; height?: number; origin: "camera" | "upload" };

type Facing = "user" | "environment";
type Phase = "intro" | "starting" | "live" | "error";
type CamError = { title: string; detail: string };

export const MAX_VIDEO_SECONDS = 60;
const VIDEO_BITRATE = 2_500_000;
const TIMERS = [0, 3, 10] as const;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,video/mp4,video/webm,video/quicktime";

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

function describeError(err: unknown): CamError {
  const name = (err as { name?: string })?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      title: "Camera access was blocked",
      detail: "Allow camera access for this site in your browser settings and try again — or upload a photo or video from your device instead.",
    };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { title: "No camera found", detail: "We couldn't find a camera on this device. You can still upload a photo or video." };
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return {
      title: "Camera is busy",
      detail: "Another app or tab may be using the camera. Close it and try again, or upload from your device.",
    };
  }
  return { title: "Camera unavailable", detail: "Your browser couldn't start the camera. You can upload from your device instead." };
}

export function CameraCapture({ onCapture, onClose }: { onCapture: (c: Captured) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordStartRef = useRef(0);
  const tickRef = useRef<number | undefined>(undefined);
  const countdownRef = useRef<number | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<CamError | null>(null);
  const [facing, setFacing] = useState<Facing>("user");
  const [multiCam, setMultiCam] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [flash, setFlash] = useState(false);
  const [screenFlash, setScreenFlash] = useState(false);
  const [timer, setTimer] = useState<(typeof TIMERS)[number]>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [hasAudio, setHasAudio] = useState(true);
  const [importing, setImporting] = useState(false);

  const canRecord = typeof window !== "undefined" && typeof MediaRecorder !== "undefined";

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(
    async (wanted: Facing) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError({
          title: "Camera not supported here",
          detail: "This browser (or an insecure http:// connection) doesn't allow camera access. Upload from your device instead.",
        });
        setPhase("error");
        return;
      }
      stopStream();
      setPhase("starting");
      setError(null);
      const video: MediaTrackConstraints = { facingMode: { ideal: wanted }, width: { ideal: 1920 }, height: { ideal: 1080 } };
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
        setHasAudio(true);
      } catch (err) {
        const name = (err as { name?: string })?.name;
        // Microphone missing or denied: still offer the camera without sound.
        if (name === "NotAllowedError" || name === "NotFoundError" || name === "NotReadableError" || name === "OverconstrainedError") {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video });
            setHasAudio(false);
          } catch (err2) {
            setError(describeError(err2));
            setPhase("error");
            return;
          }
        } else {
          setError(describeError(err));
          setPhase("error");
          return;
        }
      }
      streamRef.current = stream;
      const el = videoRef.current;
      if (el) {
        el.srcObject = stream;
        await el.play().catch(() => undefined);
      }
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      setTorchSupported(Boolean(caps.torch));
      setFlash(false);
      const settingsFacing = track?.getSettings?.().facingMode;
      setFacing(settingsFacing === "environment" ? "environment" : settingsFacing === "user" ? "user" : wanted);
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setMultiCam(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch {
        setMultiCam(false);
      }
      setPhase("live");
    },
    [stopStream],
  );

  // Start automatically only when permission was already granted; otherwise
  // explain first and let the user choose (camera is never mandatory).
  useEffect(() => {
    let cancelled = false;
    const perms = navigator.permissions as Permissions | undefined;
    if (!perms?.query) return;
    perms
      .query({ name: "camera" as PermissionName })
      .then((status) => {
        if (!cancelled && status.state === "granted") void start("user");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [start]);

  // Always release the camera when leaving.
  useEffect(() => {
    const onHide = () => stopStream();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.clearInterval(tickRef.current);
      window.clearTimeout(countdownRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.ondataavailable = null;
        recorderRef.current.onstop = null;
        recorderRef.current.stop();
      }
      stopStream();
    };
  }, [stopStream]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    const next = !flash;
    if (torchSupported && track) {
      try {
        await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      } catch {
        toast.error("Couldn't change the flash.");
        return;
      }
    }
    setFlash(next);
  };

  const takePhoto = async () => {
    const el = videoRef.current;
    if (!el || !el.videoWidth) return;
    const useScreenFlash = flash && !torchSupported && facing === "user";
    if (useScreenFlash) {
      setScreenFlash(true);
      await new Promise((r) => setTimeout(r, 180));
    }
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    const ctx = canvas.getContext("2d")!;
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
    if (useScreenFlash) setScreenFlash(false);
    try {
      const bitmap = await createImageBitmap(canvas);
      stopStream();
      onCapture({ kind: "image", bitmap, origin: "camera" });
    } catch {
      toast.error("Couldn't capture the photo. Please try again.");
    }
  };

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    window.clearInterval(tickRef.current);
  }, []);

  const startRecording = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickMimeType();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: VIDEO_BITRATE,
        audioBitsPerSecond: hasAudio ? 128_000 : undefined,
      });
    } catch {
      toast.error("Video recording isn't supported in this browser. Try a photo or upload a video.");
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      setRecording(false);
      setElapsed(0);
      const durationMs = Math.min(Math.round(performance.now() - recordStartRef.current), MAX_VIDEO_SECONDS * 1000);
      const type = (rec.mimeType || mimeType || "video/webm").split(";")[0];
      const blob = new Blob(chunks, { type });
      if (blob.size === 0 || durationMs < 300) {
        toast.error("That clip was too short. Hold on a little longer.");
        return;
      }
      const el = videoRef.current;
      const width = el?.videoWidth || undefined;
      const height = el?.videoHeight || undefined;
      stopStream();
      onCapture({ kind: "video", blob, durationMs, width, height, origin: "camera" });
    };
    recorderRef.current = rec;
    recordStartRef.current = performance.now();
    rec.start(1000);
    setRecording(true);
    setElapsed(0);
    tickRef.current = window.setInterval(() => {
      const secs = (performance.now() - recordStartRef.current) / 1000;
      setElapsed(secs);
      if (secs >= MAX_VIDEO_SECONDS) stopRecording();
    }, 100);
  };

  const runWithTimer = (fn: () => void) => {
    if (!timer) return fn();
    let left: number = timer;
    setCountdown(left);
    const step = () => {
      left -= 1;
      if (left <= 0) {
        setCountdown(null);
        fn();
      } else {
        setCountdown(left);
        countdownRef.current = window.setTimeout(step, 1000);
      }
    };
    countdownRef.current = window.setTimeout(step, 1000);
  };

  const onShutter = () => {
    if (countdown !== null) {
      window.clearTimeout(countdownRef.current);
      setCountdown(null);
      return;
    }
    if (mode === "photo") runWithTimer(() => void takePhoto());
    else if (recording) stopRecording();
    else runWithTimer(startRecording);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const check = validateUpload(file.type, file.size, "snap");
    if (!check.ok) {
      toast.error(check.reason);
      return;
    }
    setImporting(true);
    try {
      if (check.kind === "image") {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
        if (!bitmap) {
          toast.error("This image format can't be opened in your browser. Try a JPEG or PNG.");
          return;
        }
        stopStream();
        onCapture({ kind: "image", bitmap, origin: "upload" });
      } else {
        const meta = await mediaDimensions(file);
        if (meta.durationMs === undefined) {
          toast.error("This video can't be played in your browser. Try an MP4 or WebM file.");
          return;
        }
        if (meta.durationMs > MAX_VIDEO_SECONDS * 1000 + 500) {
          toast.error(`Videos can be at most ${MAX_VIDEO_SECONDS} seconds long.`);
          return;
        }
        stopStream();
        onCapture({ kind: "video", blob: file, durationMs: meta.durationMs, width: meta.width, height: meta.height, origin: "upload" });
      }
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const ringProgress = Math.min(1, elapsed / MAX_VIDEO_SECONDS);
  const live = phase === "live";

  return (
    <div className="relative h-full w-full overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={cn("absolute inset-0 h-full w-full object-cover transition-opacity", live ? "opacity-100" : "opacity-0", facing === "user" && "-scale-x-100")}
        aria-label="Camera preview"
      />

      <input ref={fileRef} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onFile(e.target.files?.[0])} />

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={onClose} className="rounded-full bg-black/30 p-2.5 backdrop-blur hover:bg-black/50" aria-label="Close camera">
          <X className="h-5 w-5" />
        </button>
        {live ? (
          <div className="flex items-center gap-2">
            {torchSupported || facing === "user" ? (
              <button
                type="button"
                onClick={() => void toggleTorch()}
                aria-pressed={flash}
                aria-label={torchSupported ? (flash ? "Turn torch off" : "Turn torch on") : flash ? "Turn screen flash off" : "Turn screen flash on"}
                className={cn("rounded-full p-2.5 backdrop-blur", flash ? "bg-white text-black" : "bg-black/30 hover:bg-black/50")}
              >
                {flash ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setTimer((t) => TIMERS[(TIMERS.indexOf(t) + 1) % TIMERS.length])}
              aria-label={`Self-timer: ${timer ? `${timer} seconds` : "off"}`}
              className={cn("flex items-center gap-1 rounded-full px-3 py-2.5 text-xs font-bold backdrop-blur", timer ? "bg-white text-black" : "bg-black/30 hover:bg-black/50")}
              disabled={recording}
            >
              <Timer className="h-5 w-5" />
              {timer ? `${timer}s` : "Off"}
            </button>
            {multiCam ? (
              <button
                type="button"
                onClick={() => void start(facing === "user" ? "environment" : "user")}
                disabled={recording}
                className="rounded-full bg-black/30 p-2.5 backdrop-blur hover:bg-black/50 disabled:opacity-40"
                aria-label="Switch camera"
              >
                <RefreshCcw className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {live && !hasAudio ? (
        <div className="absolute left-1/2 top-16 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/50 px-3 py-1 text-xs font-semibold backdrop-blur">
          <MicOff className="h-3.5 w-3.5" /> Microphone unavailable — videos record without sound
        </div>
      ) : null}

      {/* Intro / starting / error */}
      {!live ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8 text-center">
          {phase === "starting" ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-white/80" aria-hidden />
              <p className="text-sm text-white/80" role="status">
                Starting camera… your browser may ask for permission.
              </p>
            </>
          ) : (
            <>
              <div className="brand-gradient flex h-20 w-20 items-center justify-center rounded-[1.75rem] shadow-[var(--shadow-pop)]">
                {phase === "error" ? <CameraOff className="h-9 w-9" /> : <Camera className="h-9 w-9" />}
              </div>
              <div className="max-w-xs space-y-2" role={phase === "error" ? "alert" : undefined}>
                <h1 className="font-display text-xl font-bold">{error?.title ?? "Snap a moment"}</h1>
                <p className="text-sm text-white/75">
                  {error?.detail ??
                    "Quick Chat uses your camera only while this screen is open, to take photos and videos you choose to share. Prefer not to? Upload from your device instead."}
                </p>
              </div>
              <div className="flex w-full max-w-xs flex-col gap-2.5">
                <Button variant="gradient" size="lg" onClick={() => void start(facing)}>
                  <Camera className="h-5 w-5" />
                  {phase === "error" ? "Try again" : "Enable camera"}
                </Button>
                <Button variant="secondary" size="lg" onClick={() => fileRef.current?.click()} loading={importing} className="bg-white/15 text-white hover:bg-white/25">
                  <ImageUp className="h-5 w-5" /> Upload from device
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {/* Countdown */}
      <AnimatePresence>
        {countdown !== null ? (
          <motion.div
            key={countdown}
            initial={{ scale: 1.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center font-display text-8xl font-extrabold drop-shadow-lg"
            aria-live="assertive"
          >
            {countdown}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {screenFlash ? <div className="absolute inset-0 z-20 bg-white" aria-hidden /> : null}

      {/* Bottom controls */}
      {live ? (
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10">
          {recording ? (
            <p className="mb-3 text-center text-sm font-bold tabular-nums" aria-live="polite">
              <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500 align-middle" />
              {Math.floor(elapsed)}s / {MAX_VIDEO_SECONDS}s
            </p>
          ) : null}
          <div className="mx-auto flex max-w-sm items-center justify-between">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={recording || importing}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur hover:bg-white/25 disabled:opacity-40"
              aria-label="Upload from device"
            >
              {importing ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImageUp className="h-5 w-5" />}
            </button>

            <button
              type="button"
              onClick={onShutter}
              className="relative flex h-20 w-20 items-center justify-center rounded-full"
              aria-label={
                countdown !== null
                  ? "Cancel timer"
                  : mode === "photo"
                    ? "Take photo"
                    : recording
                      ? "Stop recording"
                      : "Start recording"
              }
            >
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 80 80" aria-hidden>
                <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="5" />
                {recording ? (
                  <circle
                    cx="40"
                    cy="40"
                    r="36"
                    fill="none"
                    stroke="#ff5e7e"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 36}
                    strokeDashoffset={2 * Math.PI * 36 * (1 - ringProgress)}
                  />
                ) : null}
              </svg>
              <motion.span
                animate={recording ? { scale: 0.5, borderRadius: 10 } : { scale: 1, borderRadius: 999 }}
                className={cn("block h-[60px] w-[60px]", mode === "video" ? "bg-[#ff5e7e]" : "bg-white/90")}
              />
            </button>

            <div className="flex h-12 w-12" aria-hidden />
          </div>
          {canRecord ? (
            <div className="mt-4 flex justify-center" role="radiogroup" aria-label="Capture mode">
              {(["photo", "video"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  disabled={recording || countdown !== null}
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors",
                    mode === m ? "bg-white text-black" : "text-white/70 hover:text-white",
                  )}
                >
                  {m === "photo" ? "Photo" : `Video · ${MAX_VIDEO_SECONDS}s`}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
