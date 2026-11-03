/**
 * Video-call effects catalogue: ids, labels, colour-filter parameters,
 * premium list, capability detection and localStorage persistence.
 *
 * Everything here runs in the browser; camera frames never leave the device
 * except as the (already processed) WebRTC track sent to the call.
 */

export type VideoEffectId =
  | "none"
  | "natural"
  | "brightness"
  | "soft-focus"
  | "warm"
  | "cool"
  | "vintage"
  | "mono"
  | "background-blur"
  | "virtual-background";

export type VideoEffectKind = "none" | "color" | "background";

export type VideoEffectDef = {
  id: VideoEffectId;
  label: string;
  kind: VideoEffectKind;
  description?: string;
};

export const VIDEO_EFFECTS: readonly VideoEffectDef[] = [
  { id: "none", label: "None", kind: "none" },
  { id: "natural", label: "Natural", kind: "color", description: "A subtle lift in tone and colour" },
  { id: "brightness", label: "Brightness", kind: "color", description: "Brighten or darken your video" },
  { id: "soft-focus", label: "Soft focus", kind: "color", description: "Gently softens fine detail" },
  { id: "warm", label: "Warm", kind: "color" },
  { id: "cool", label: "Cool", kind: "color" },
  { id: "vintage", label: "Vintage", kind: "color" },
  { id: "mono", label: "Black & white", kind: "color" },
  { id: "background-blur", label: "Background blur", kind: "background" },
  { id: "virtual-background", label: "Virtual background", kind: "background" },
];

/**
 * Effects intended for the premium tier. Nothing is gated here — the call
 * screen's `EffectsMenu` accepts `premiumUnlocked` / `onUpgrade` props and
 * locks these ids when `premiumUnlocked === false`.
 */
export const PREMIUM_VIDEO_EFFECTS: readonly VideoEffectId[] = ["virtual-background", "vintage"];

export function isPremiumEffect(id: VideoEffectId): boolean {
  return PREMIUM_VIDEO_EFFECTS.includes(id);
}

export function effectDef(id: VideoEffectId): VideoEffectDef {
  return VIDEO_EFFECTS.find((e) => e.id === id) ?? VIDEO_EFFECTS[0];
}

/* ---------------------------------------------------------------------------
 * Colour filter parameters (consumed by ColorFilterProcessor's shader)
 * ------------------------------------------------------------------------- */

export type ColorParams = {
  /** Multiplier, 1 = unchanged. */
  brightness: number;
  /** 1 = unchanged. */
  contrast: number;
  /** 0 = greyscale, 1 = unchanged. */
  saturation: number;
  /** 0..1 sepia mix. */
  sepia: number;
  /** Per-channel RGB multiplier. */
  tint: [number, number, number];
  /** 0..1 edge-preserving blur mix ("Soft focus"). */
  soften: number;
  /** 0..1 corner darkening. */
  vignette: number;
};

export const NEUTRAL_COLOR: ColorParams = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  sepia: 0,
  tint: [1, 1, 1],
  soften: 0,
  vignette: 0,
};

export const BRIGHTNESS_MIN = 0.6;
export const BRIGHTNESS_MAX = 1.6;
export const BRIGHTNESS_DEFAULT = 1.2;

export function colorParamsFor(id: VideoEffectId, brightness = BRIGHTNESS_DEFAULT): ColorParams | null {
  switch (id) {
    case "natural":
      return { ...NEUTRAL_COLOR, brightness: 1.04, contrast: 1.06, saturation: 1.1 };
    case "brightness":
      return { ...NEUTRAL_COLOR, brightness: clamp(brightness, BRIGHTNESS_MIN, BRIGHTNESS_MAX) };
    case "soft-focus":
      return { ...NEUTRAL_COLOR, brightness: 1.04, contrast: 0.97, soften: 0.75 };
    case "warm":
      return { ...NEUTRAL_COLOR, brightness: 1.02, saturation: 1.05, sepia: 0.08, tint: [1.08, 1.0, 0.88] };
    case "cool":
      return { ...NEUTRAL_COLOR, saturation: 0.98, tint: [0.9, 0.99, 1.1] };
    case "vintage":
      return { ...NEUTRAL_COLOR, brightness: 1.03, contrast: 0.9, saturation: 0.8, sepia: 0.45, tint: [1.04, 1.0, 0.92], vignette: 0.45 };
    case "mono":
      return { ...NEUTRAL_COLOR, contrast: 1.12, saturation: 0 };
    default:
      return null;
  }
}

/** CSS approximation of each colour effect, used only for the menu thumbnails. */
export function previewCssFilter(id: VideoEffectId, brightness = BRIGHTNESS_DEFAULT): string | undefined {
  switch (id) {
    case "natural":
      return "brightness(1.04) contrast(1.06) saturate(1.1)";
    case "brightness":
      return `brightness(${clamp(brightness, BRIGHTNESS_MIN, BRIGHTNESS_MAX)})`;
    case "soft-focus":
      return "blur(1px) brightness(1.04)";
    case "warm":
      return "sepia(0.25) saturate(1.2) hue-rotate(-8deg)";
    case "cool":
      return "saturate(0.95) hue-rotate(12deg) brightness(1.02)";
    case "vintage":
      return "sepia(0.5) contrast(0.9) saturate(0.8)";
    case "mono":
      return "grayscale(1) contrast(1.12)";
    default:
      return undefined;
  }
}

/* ---------------------------------------------------------------------------
 * Capability detection
 * ------------------------------------------------------------------------- */

export type VideoEffectSupport = {
  /** WebGL + canvas.captureStream — needed for every colour filter. */
  color: boolean;
  /** MediaPipe segmentation pipeline (@livekit/track-processors). */
  background: boolean;
  /** Few CPU cores: colour filters by default, background effects flagged as slow. */
  lowPower: boolean;
};

export const NO_EFFECT_SUPPORT: VideoEffectSupport = { color: false, background: false, lowPower: false };

let cachedSupport: VideoEffectSupport | null = null;

export function detectVideoEffectSupport(): VideoEffectSupport {
  if (typeof window === "undefined" || typeof document === "undefined") return NO_EFFECT_SUPPORT;
  if (cachedSupport) return cachedSupport;
  const captureStream = typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype;
  let webgl = false;
  let webgl2 = false;
  try {
    const c = document.createElement("canvas");
    webgl2 = Boolean(c.getContext("webgl2"));
    webgl = webgl2 || Boolean(document.createElement("canvas").getContext("webgl"));
  } catch {
    // no GPU context available
  }
  // Mirrors `supportsBackgroundProcessors()` from @livekit/track-processors, without
  // pulling the ~MediaPipe bundle in just to answer the question.
  const streamProcessor = typeof MediaStreamTrackProcessor !== "undefined" && typeof MediaStreamTrackGenerator !== "undefined";
  const fallback = captureStream && typeof VideoFrame !== "undefined";
  const background =
    webgl2 && typeof OffscreenCanvas !== "undefined" && typeof VideoFrame !== "undefined" && typeof createImageBitmap !== "undefined" && (streamProcessor || fallback);
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 0 : 0;
  cachedSupport = { color: webgl && captureStream, background, lowPower: cores > 0 && cores <= 4 };
  return cachedSupport;
}

/* ---------------------------------------------------------------------------
 * Persistence (localStorage, per device)
 * ------------------------------------------------------------------------- */

export type VideoEffectSelection = {
  effect: VideoEffectId;
  /** Brightness multiplier used by the "brightness" effect. */
  brightness: number;
  /** Background id used by the "virtual-background" effect. */
  background: string;
};

export const DEFAULT_SELECTION: VideoEffectSelection = { effect: "none", brightness: BRIGHTNESS_DEFAULT, background: "dusk" };

const STORAGE_KEY = "qc:video-effect:v1";

export function loadEffectSelection(): VideoEffectSelection {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SELECTION;
    const parsed = JSON.parse(raw) as Partial<VideoEffectSelection>;
    const effect = VIDEO_EFFECTS.some((e) => e.id === parsed.effect) ? (parsed.effect as VideoEffectId) : "none";
    const brightness = typeof parsed.brightness === "number" && Number.isFinite(parsed.brightness) ? clamp(parsed.brightness, BRIGHTNESS_MIN, BRIGHTNESS_MAX) : BRIGHTNESS_DEFAULT;
    const background = typeof parsed.background === "string" ? parsed.background : DEFAULT_SELECTION.background;
    return { effect, brightness, background };
  } catch {
    return DEFAULT_SELECTION;
  }
}

export function saveEffectSelection(sel: VideoEffectSelection): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sel));
  } catch {
    // storage blocked (private mode, quota) — the choice just won't persist
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
