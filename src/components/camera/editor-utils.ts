/** Pure helpers for the photo editor (filters, crop geometry, drawing). */

export const FILTERS = [
  { id: "none", label: "Original", css: "none" },
  { id: "vivid", label: "Vivid", css: "saturate(1.45) contrast(1.08)" },
  { id: "mono", label: "Mono", css: "grayscale(1)" },
  { id: "warm", label: "Warm", css: "sepia(0.28) saturate(1.25) hue-rotate(-8deg)" },
  { id: "cool", label: "Cool", css: "saturate(1.1) hue-rotate(14deg) brightness(1.03)" },
  { id: "fade", label: "Fade", css: "contrast(0.82) brightness(1.1) saturate(0.75)" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.45) brightness(0.92)" },
] as const;

export type FilterId = (typeof FILTERS)[number]["id"];

export function filterCss(id: FilterId): string {
  return FILTERS.find((f) => f.id === id)?.css ?? "none";
}

export const CROPS = [
  { id: "original", label: "Original", ratio: null },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
] as const;

export type CropId = (typeof CROPS)[number]["id"];

export type Rotation = 0 | 90 | 180 | 270;

/** Size of the image after rotation. */
export function rotatedSize(w: number, h: number, rotation: Rotation) {
  return rotation % 180 === 0 ? { w, h } : { w: h, h: w };
}

/** Centered crop rectangle (in rotated-image coordinates) for a preset. */
export function cropRect(w: number, h: number, crop: CropId) {
  const ratio = CROPS.find((c) => c.id === crop)?.ratio ?? null;
  if (!ratio) return { x: 0, y: 0, w, h };
  if (w / h > ratio) {
    const cw = Math.round(h * ratio);
    return { x: Math.round((w - cw) / 2), y: 0, w: cw, h };
  }
  const ch = Math.round(w / ratio);
  return { x: 0, y: Math.round((h - ch) / 2), w, h: ch };
}

export type Stroke = { color: string; size: number; points: [number, number][] };

export const PEN_COLORS = ["#ffffff", "#111111", "#ff5e7e", "#ffb020", "#32d583", "#2e90fa", "#8e72ff"] as const;
export const PEN_SIZES = [
  { id: "s", label: "Thin", value: 0.008 },
  { id: "m", label: "Medium", value: 0.016 },
  { id: "l", label: "Thick", value: 0.03 },
] as const;

export const TEXT_COLORS = ["#ffffff", "#111111", "#ffde59", "#ff5e7e", "#32d583", "#2e90fa", "#c065f5"] as const;

export const STICKERS = ["😂", "😍", "🔥", "✨", "💯", "🥳", "😎", "❤️", "👀", "🙌", "🌈", "⭐", "🎉", "🤍", "😭", "🫶", "🍕", "☕", "🌸", "⚡"] as const;

/** Draws normalized strokes (points 0..1, size = fraction of width). */
export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], width: number, height: number) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    if (s.points.length === 0) continue;
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.size * width;
    if (s.points.length === 1) {
      const [x, y] = s.points[0];
      ctx.beginPath();
      ctx.arc(x * width, y * height, (s.size * width) / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(s.points[0][0] * width, s.points[0][1] * height);
    for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i][0] * width, s.points[i][1] * height);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Renders the image with rotation, crop and filter into `canvas`, scaled so the
 * longer edge is at most `maxEdge`. Returns the output size.
 */
export function renderBase(
  canvas: HTMLCanvasElement,
  source: ImageBitmap,
  rotation: Rotation,
  crop: CropId,
  filter: FilterId,
  maxEdge: number,
) {
  const r = rotatedSize(source.width, source.height, rotation);
  const c = cropRect(r.w, r.h, crop);
  const scale = Math.min(1, maxEdge / Math.max(c.w, c.h));
  const outW = Math.max(1, Math.round(c.w * scale));
  const outH = Math.max(1, Math.round(c.h * scale));
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;
  ctx.save();
  ctx.filter = filterCss(filter);
  ctx.scale(scale, scale);
  ctx.translate(-c.x, -c.y);
  // Rotate around the rotated-image frame.
  ctx.translate(r.w / 2, r.h / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  ctx.restore();
  ctx.filter = "none";
  return { width: outW, height: outH };
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not export the image."))), "image/jpeg", quality),
  );
}
