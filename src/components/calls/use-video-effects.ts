"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { LocalVideoTrack } from "livekit-client";
import type { BackgroundProcessorWrapper } from "@livekit/track-processors";
import { createBackgroundProcessor, switchBackgroundProcessor, type BackgroundMode } from "@/lib/video-effects/background-processor";
import { ColorFilterProcessor } from "@/lib/video-effects/color-filter-processor";
import {
  colorParamsFor,
  detectVideoEffectSupport,
  effectDef,
  isPremiumEffect,
  loadEffectSelection,
  saveEffectSelection,
  type ColorParams,
  type VideoEffectSelection,
  type VideoEffectSupport,
} from "@/lib/video-effects/effects";

const BACKGROUND_PROCESSOR_NAME = "qc-background";

type Desired = { kind: "none" } | { kind: "color"; params: ColorParams } | { kind: "background"; mode: BackgroundMode };

export type VideoEffectsStatus = "idle" | "loading";

function initialSelection(support: VideoEffectSupport): VideoEffectSelection {
  const saved = loadEffectSelection();
  const kind = effectDef(saved.effect).kind;
  // Low-power devices start with colour filters only; background effects can
  // still be picked during the call (they're labelled as possibly slow).
  if (kind === "background" && (!support.background || support.lowPower)) return { ...saved, effect: "none" };
  if (kind === "color" && !support.color) return { ...saved, effect: "none" };
  return saved;
}

function desiredFor(sel: VideoEffectSelection, support: VideoEffectSupport, premiumUnlocked: boolean): Desired {
  const def = effectDef(sel.effect);
  if (!premiumUnlocked && isPremiumEffect(def.id)) return { kind: "none" };
  if (def.kind === "color" && support.color) {
    const params = colorParamsFor(def.id, sel.brightness);
    return params ? { kind: "color", params } : { kind: "none" };
  }
  if (def.kind === "background" && support.background) {
    return {
      kind: "background",
      mode: def.id === "background-blur" ? { mode: "background-blur" } : { mode: "virtual-background", backgroundId: sel.background },
    };
  }
  return { kind: "none" };
}

/**
 * Whether the camera is currently producing frames we can set a processor on.
 * With a processor attached, `mediaStreamTrack` is the processed track (which
 * stays live while the camera is off), so mute state is the signal there.
 */
function cameraLive(track: LocalVideoTrack): boolean {
  if (track.isStopped || track.isMuted) return false;
  return track.getProcessor() !== undefined || track.mediaStreamTrack.readyState === "live";
}

/**
 * Applies the chosen video effect to the local camera track (before or after
 * publishing). All processor changes run through one promise queue so rapid
 * taps / slider drags never race LiveKit's setProcessor.
 *
 * While the camera is off, the current processor stays attached but idle (its
 * source track has ended, so no frames are processed). That way turning the
 * camera back on or switching cameras goes through LiveKit's
 * `processor.restart()` and never publishes an unfiltered frame. Structural
 * changes (e.g. colour → background) requested while the camera is off are
 * applied as soon as it's back on.
 */
export function useVideoEffects({
  track,
  cameraOn,
  premiumUnlocked = true,
}: {
  track: LocalVideoTrack | null | undefined;
  cameraOn: boolean;
  premiumUnlocked?: boolean;
}) {
  const [support] = useState(detectVideoEffectSupport);
  const [selection, setSelection] = useState<VideoEffectSelection>(() => initialSelection(support));
  const [status, setStatus] = useState<VideoEffectsStatus>("idle");
  const desired = useMemo(() => desiredFor(selection, support, premiumUnlocked), [selection, support, premiumUnlocked]);
  const desiredRef = useRef(desired);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);

  useEffect(() => {
    desiredRef.current = desired;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const apply = useCallback(async (t: LocalVideoTrack) => {
    const want = desiredRef.current;
    const current = t.getProcessor();
    const live = cameraLive(t);

    if (want.kind === "none") {
      if (current && live) await t.stopProcessor();
      return;
    }
    if (want.kind === "color") {
      if (current instanceof ColorFilterProcessor) {
        current.setParams(want.params);
        return;
      }
      if (!live || !mountedRef.current) return;
      await t.setProcessor(new ColorFilterProcessor(want.params));
      return;
    }
    if (current && current.name === BACKGROUND_PROCESSOR_NAME) {
      await switchBackgroundProcessor(current as BackgroundProcessorWrapper, want.mode);
      return;
    }
    if (!live || !mountedRef.current) return;
    setStatus("loading");
    try {
      const processor = await createBackgroundProcessor(want.mode);
      if (!mountedRef.current || t.isStopped) return;
      await t.setProcessor(processor);
    } finally {
      if (mountedRef.current) setStatus("idle");
    }
  }, []);

  /** Queue a sync of `t` with the current selection. Resolves when done (never rejects). */
  const sync = useCallback(
    (t: LocalVideoTrack | null | undefined): Promise<void> => {
      const next = queueRef.current.then(async () => {
        if (!t || t.isStopped) return;
        try {
          await apply(t);
        } catch (error) {
          console.warn("[video-effects] couldn't apply effect", error);
          if (!mountedRef.current) return;
          const failedBackground = desiredRef.current.kind === "background";
          toast.error(failedBackground ? "Couldn't start the background effect on this device." : "Couldn't apply the video effect.");
          // Fall back to no effect for this call (the saved preference is kept).
          setSelection((s) => ({ ...s, effect: "none" }));
          try {
            if (t.getProcessor() && !t.isStopped) await t.stopProcessor();
          } catch {
            // ignore — the track keeps sending the raw camera
          }
        }
      });
      queueRef.current = next;
      return next;
    },
    [apply],
  );

  // Re-sync whenever the track, camera state or selection changes.
  useEffect(() => {
    void sync(track);
  }, [sync, track, cameraOn, desired]);

  /**
   * Apply the current effect to a freshly acquired (not yet published) track,
   * waiting at most `timeoutMs` so the first published frames are already
   * processed when possible. Never throws.
   */
  const prepare = useCallback(
    (t: LocalVideoTrack, timeoutMs = 2500): Promise<void> =>
      Promise.race([sync(t), new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs))]),
    [sync],
  );

  const choose = useCallback((next: Partial<VideoEffectSelection>) => {
    setSelection((s) => {
      const merged = { ...s, ...next };
      saveEffectSelection(merged);
      return merged;
    });
  }, []);

  return {
    support,
    selection,
    /** The effect actually in force (None when unsupported/locked). */
    activeKind: desired.kind,
    status,
    choose,
    prepare,
    /** Re-check the track after camera restarts (switch camera, camera on). */
    resync: () => void sync(track),
  };
}
