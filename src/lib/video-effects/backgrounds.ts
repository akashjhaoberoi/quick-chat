/**
 * Built-in virtual backgrounds, generated in code (no image assets, nothing
 * fetched). Each one is rendered to a 1280×720 canvas once and handed to the
 * segmentation processor as a data: URL (loaded through an <img>, which the
 * CSP's img-src already allows for data:).
 */

export type VirtualBackgroundDef = {
  id: string;
  label: string;
  /** Gradient stops, top-left → bottom-right. A single stop is a plain colour. */
  stops: string[];
  /** Optional soft light spot (CSS colour) in the upper-left area. */
  glow?: string;
};

export const VIRTUAL_BACKGROUNDS: readonly VirtualBackgroundDef[] = [
  { id: "dusk", label: "Dusk", stops: ["#2b1d5c", "#7c3f8f", "#e0726f"], glow: "rgba(255,200,170,0.35)" },
  { id: "sunrise", label: "Sunrise", stops: ["#ff9a5a", "#ffc79a", "#fde6cf"], glow: "rgba(255,255,255,0.35)" },
  { id: "ocean", label: "Ocean", stops: ["#0b3d5c", "#1f7a8c", "#7fc8c2"], glow: "rgba(200,255,250,0.25)" },
  { id: "forest", label: "Forest", stops: ["#173225", "#2f5d45", "#8aa57a"], glow: "rgba(230,255,200,0.2)" },
  { id: "slate", label: "Slate", stops: ["#2a2d34"] },
  { id: "paper", label: "Paper", stops: ["#efebe4"] },
];

const WIDTH = 1280;
const HEIGHT = 720;
const cache = new Map<string, string>();

export function virtualBackground(id: string): VirtualBackgroundDef {
  return VIRTUAL_BACKGROUNDS.find((b) => b.id === id) ?? VIRTUAL_BACKGROUNDS[0];
}

/** CSS background for the menu swatch. */
export function backgroundSwatchCss(def: VirtualBackgroundDef): string {
  if (def.stops.length === 1) return def.stops[0];
  return `linear-gradient(135deg, ${def.stops.join(", ")})`;
}

/** Renders (once) and returns the background as a JPEG data: URL. */
export function virtualBackgroundUrl(id: string): string {
  const def = virtualBackground(id);
  const hit = cache.get(def.id);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  if (def.stops.length === 1) {
    ctx.fillStyle = def.stops[0];
  } else {
    const g = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    def.stops.forEach((stop, i) => g.addColorStop(i / (def.stops.length - 1), stop));
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (def.glow) {
    const r = ctx.createRadialGradient(WIDTH * 0.28, HEIGHT * 0.22, 0, WIDTH * 0.28, HEIGHT * 0.22, WIDTH * 0.55);
    r.addColorStop(0, def.glow);
    r.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  const url = canvas.toDataURL("image/jpeg", 0.9);
  cache.set(def.id, url);
  return url;
}
