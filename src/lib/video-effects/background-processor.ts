import type { BackgroundProcessorWrapper } from "@livekit/track-processors";
import { virtualBackgroundUrl } from "./backgrounds";

/**
 * Where MediaPipe's segmentation runtime (wasm + loader script) and model are
 * loaded from. These are the @livekit/track-processors defaults, pinned to the
 * exact @mediapipe/tasks-vision version it depends on (0.10.14). Only the
 * runtime and model are downloaded — camera frames are segmented locally and
 * never sent anywhere.
 *
 * To self-host instead (no third-party requests, simpler CSP), copy
 * node_modules/@mediapipe/tasks-vision/wasm/* to e.g. public/mediapipe/wasm/ and
 * the selfie_segmenter.tflite model to public/mediapipe/, then point these at
 * "/mediapipe/wasm" and "/mediapipe/selfie_segmenter.tflite".
 */
export const SEGMENTATION_ASSETS = {
  // Self-hosted: the runtime is copied from node_modules at build time
  // (scripts/copy-mediapipe.mjs) and the model is committed under public/models.
  tasksVisionFileSet: "/mediapipe/wasm",
  modelAssetPath: "/models/selfie_segmenter.tflite",
} as const;

export const BACKGROUND_BLUR_RADIUS = 12;
const MAX_FPS = 24;

export type BackgroundMode = { mode: "background-blur" } | { mode: "virtual-background"; backgroundId: string };

/** Lazily loads @livekit/track-processors (MediaPipe is large) and builds a processor. */
export async function createBackgroundProcessor(mode: BackgroundMode): Promise<BackgroundProcessorWrapper> {
  const { BackgroundProcessor } = await import("@livekit/track-processors");
  const common = { assetPaths: { ...SEGMENTATION_ASSETS }, maxFps: MAX_FPS };
  return mode.mode === "background-blur"
    ? BackgroundProcessor({ ...common, mode: "background-blur", blurRadius: BACKGROUND_BLUR_RADIUS }, "qc-background")
    : BackgroundProcessor({ ...common, mode: "virtual-background", imagePath: virtualBackgroundUrl(mode.backgroundId) }, "qc-background");
}

/** Switches an existing background processor in place (no re-init, no flash). */
export async function switchBackgroundProcessor(processor: BackgroundProcessorWrapper, mode: BackgroundMode): Promise<void> {
  if (mode.mode === "background-blur") {
    await processor.switchTo({ mode: "background-blur", blurRadius: BACKGROUND_BLUR_RADIUS });
  } else {
    await processor.switchTo({ mode: "virtual-background", imagePath: virtualBackgroundUrl(mode.backgroundId) });
  }
}
