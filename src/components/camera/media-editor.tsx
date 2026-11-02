"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowRight, Crop, Pencil, RotateCw, Smile, Sparkles, Trash2, Type, Undo2, Volume2, VolumeX, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, newClientId } from "@/lib/utils";
import type { Overlay } from "@/types/models";
import type { Captured } from "./camera-capture";
import { FitFrame } from "./fit-frame";
import { drawOverlays, overlayClass, overlayStyle } from "./overlay-layer";
import {
  canvasToJpeg, CROPS, cropRect, drawStrokes, FILTERS, filterCss, PEN_COLORS, PEN_SIZES, renderBase, rotatedSize, STICKERS,
  TEXT_COLORS, type CropId, type FilterId, type Rotation, type Stroke,
} from "./editor-utils";

export type EditedMedia =
  | { kind: "image"; blob: Blob; width: number; height: number; previewUrl: string }
  | { kind: "video"; blob: Blob; width?: number; height?: number; durationMs: number; overlays: Overlay[]; previewUrl: string };

export type EditorSource =
  | { kind: "image"; bitmap: ImageBitmap }
  | { kind: "video"; url: string; blob: Blob; durationMs: number; width?: number; height?: number };

type Tool = "none" | "adjust" | "filter" | "draw" | "text" | "sticker";
type EditableOverlay = Overlay & { id: string };

const PREVIEW_EDGE = 1440;
const EXPORT_EDGE = 2048;

export function toEditorSource(c: Captured, videoUrl?: string): EditorSource {
  return c.kind === "image"
    ? { kind: "image", bitmap: c.bitmap }
    : { kind: "video", url: videoUrl!, blob: c.blob, durationMs: c.durationMs, width: c.width, height: c.height };
}

export function MediaEditor({
  source,
  onRetake,
  onDone,
}: {
  source: EditorSource;
  onRetake: () => void;
  onDone: (media: EditedMedia) => void;
}) {
  const isImage = source.kind === "image";
  const [tool, setTool] = useState<Tool>("none");
  const [rotation, setRotation] = useState<Rotation>(0);
  const [crop, setCrop] = useState<CropId>("original");
  const [filter, setFilter] = useState<FilterId>("none");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0]);
  const [penSize, setPenSize] = useState<number>(PEN_SIZES[1].value);
  const [overlays, setOverlays] = useState<EditableOverlay[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [textColor, setTextColor] = useState<string>(TEXT_COLORS[0]);
  const [videoDims, setVideoDims] = useState<{ w: number; h: number } | null>(null);
  const [muted, setMuted] = useState(true);
  const [exporting, setExporting] = useState(false);

  const previewRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const currentStroke = useRef<Stroke | null>(null);
  const dragRef = useRef<{ id: string; pointerId: number } | null>(null);

  // Frame size (rotated + cropped) for photos; intrinsic size for videos.
  const frame = useMemo(() => {
    if (source.kind === "image") {
      const r = rotatedSize(source.bitmap.width, source.bitmap.height, rotation);
      const c = cropRect(r.w, r.h, crop);
      return { w: c.w, h: c.h };
    }
    if (videoDims) return videoDims;
    if (source.width && source.height) return { w: source.width, h: source.height };
    return { w: 9, h: 16 };
  }, [source, rotation, crop, videoDims]);

  const drawSize = useMemo(() => {
    const scale = Math.min(1, PREVIEW_EDGE / Math.max(frame.w, frame.h));
    return { w: Math.max(1, Math.round(frame.w * scale)), h: Math.max(1, Math.round(frame.h * scale)) };
  }, [frame]);

  // Small thumbnail for the filter strip.
  const thumb = useMemo(() => {
    if (source.kind !== "image") return null;
    const c = document.createElement("canvas");
    const s = 96 / Math.max(source.bitmap.width, source.bitmap.height);
    c.width = Math.max(1, Math.round(source.bitmap.width * s));
    c.height = Math.max(1, Math.round(source.bitmap.height * s));
    c.getContext("2d")!.drawImage(source.bitmap, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.7);
  }, [source]);

  // Paint the photo preview.
  useEffect(() => {
    if (source.kind !== "image" || !previewRef.current) return;
    renderBase(previewRef.current, source.bitmap, rotation, crop, filter, PREVIEW_EDGE);
  }, [source, rotation, crop, filter]);

  // Paint committed strokes.
  useEffect(() => {
    const c = drawRef.current;
    if (!c) return;
    c.width = drawSize.w;
    c.height = drawSize.h;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    drawStrokes(ctx, strokes, c.width, c.height);
  }, [strokes, drawSize]);

  const selected = overlays.find((o) => o.id === selectedId) ?? null;

  const updateOverlay = (id: string, patch: Partial<Overlay>) =>
    setOverlays((list) => list.map((o) => (o.id === id ? ({ ...o, ...patch } as EditableOverlay) : o)));

  const removeOverlay = (id: string) => {
    setOverlays((list) => list.filter((o) => o.id !== id));
    setSelectedId(null);
  };

  const addText = () => {
    const text = draftText.trim();
    if (!text) return;
    const id = newClientId();
    setOverlays((list) => [...list, { id, type: "text", text: text.slice(0, 200), color: textColor, x: 0.5, y: 0.45, size: 0.075 }]);
    setDraftText("");
    setSelectedId(id);
    setTool("none");
  };

  const addSticker = (emoji: string) => {
    const id = newClientId();
    setOverlays((list) => [...list, { id, type: "emoji", emoji, x: 0.5, y: 0.5, size: 0.2 }]);
    setSelectedId(id);
    setTool("none");
  };

  // ---- Drawing --------------------------------------------------------------
  const pointFrom = (e: ReactPointerEvent, el: HTMLElement): [number, number] => {
    const rect = el.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    ];
  };

  const onDrawDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (tool !== "draw") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    currentStroke.current = { color: penColor, size: penSize, points: [pointFrom(e, e.currentTarget)] };
    const ctx = e.currentTarget.getContext("2d")!;
    drawStrokes(ctx, [currentStroke.current], e.currentTarget.width, e.currentTarget.height);
  };

  const onDrawMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const s = currentStroke.current;
    if (!s) return;
    const p = pointFrom(e, e.currentTarget);
    const prev = s.points[s.points.length - 1];
    s.points.push(p);
    const ctx = e.currentTarget.getContext("2d")!;
    drawStrokes(ctx, [{ ...s, points: [prev, p] }], e.currentTarget.width, e.currentTarget.height);
  };

  const onDrawUp = () => {
    const s = currentStroke.current;
    currentStroke.current = null;
    if (s) setStrokes((list) => [...list, s]);
  };

  // ---- Overlay dragging --------------------------------------------------------
  const onOverlayDown = (e: ReactPointerEvent<HTMLElement>, id: string) => {
    if (tool === "draw") return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id, pointerId: e.pointerId };
    setSelectedId(id);
  };

  const onOverlayMove = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const el = frameRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !el) return;
    const [x, y] = pointFrom(e, el);
    updateOverlay(drag.id, { x, y });
  };

  const onOverlayUp = () => {
    dragRef.current = null;
  };

  const onOverlayKey = (e: React.KeyboardEvent, o: EditableOverlay) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      updateOverlay(o.id, { x: Math.min(1, Math.max(0, o.x + moves[e.key][0])), y: Math.min(1, Math.max(0, o.y + moves[e.key][1])) });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      removeOverlay(o.id);
    }
  };

  const maxSize = (o: Overlay) => (o.type === "text" ? 0.3 : 0.6);

  // ---- Export --------------------------------------------------------------------
  const finish = async () => {
    const plain: Overlay[] = overlays.map((o) => {
      const rest: Partial<EditableOverlay> = { ...o };
      delete rest.id;
      return rest as Overlay;
    });
    if (source.kind === "video") {
      onDone({
        kind: "video",
        blob: source.blob,
        width: videoDims?.w ?? source.width,
        height: videoDims?.h ?? source.height,
        durationMs: source.durationMs,
        overlays: plain,
        previewUrl: source.url,
      });
      return;
    }
    setExporting(true);
    try {
      const canvas = document.createElement("canvas");
      const size = renderBase(canvas, source.bitmap, rotation, crop, filter, EXPORT_EDGE);
      const ctx = canvas.getContext("2d")!;
      drawStrokes(ctx, strokes, size.width, size.height);
      drawOverlays(ctx, plain, size.width, size.height);
      const blob = await canvasToJpeg(canvas, 0.9);
      onDone({ kind: "image", blob, width: size.width, height: size.height, previewUrl: URL.createObjectURL(blob) });
    } catch {
      toast.error("Couldn't prepare your photo. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const tools: { id: Tool; label: string; icon: typeof Type; photoOnly?: boolean }[] = [
    { id: "text", label: "Text", icon: Type },
    { id: "sticker", label: "Stickers", icon: Smile },
    { id: "draw", label: "Draw", icon: Pencil, photoOnly: true },
    { id: "adjust", label: "Crop & rotate", icon: Crop, photoOnly: true },
    { id: "filter", label: "Filters", icon: Sparkles, photoOnly: true },
  ];

  return (
    <div className="relative flex h-full w-full flex-col bg-black text-white">
      {/* Stage */}
      <div className="relative min-h-0 flex-1" onPointerDown={() => tool !== "draw" && setSelectedId(null)}>
        <FitFrame aspect={frame.w / frame.h} frameClassName="overflow-hidden rounded-none sm:rounded-2xl">
          <div ref={frameRef} className="absolute inset-0">
            {source.kind === "image" ? (
              <canvas ref={previewRef} className="absolute inset-0 h-full w-full" aria-label="Photo preview" role="img" />
            ) : (
              <video
                src={source.url}
                className="absolute inset-0 h-full w-full object-contain"
                autoPlay
                loop
                playsInline
                muted={muted}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (v.videoWidth && v.videoHeight) setVideoDims({ w: v.videoWidth, h: v.videoHeight });
                }}
                aria-label="Video preview"
              />
            )}
            {isImage ? (
              <canvas
                ref={drawRef}
                className={cn("absolute inset-0 h-full w-full touch-none", tool === "draw" ? "cursor-crosshair" : "pointer-events-none")}
                onPointerDown={onDrawDown}
                onPointerMove={onDrawMove}
                onPointerUp={onDrawUp}
                onPointerCancel={onDrawUp}
                aria-hidden
              />
            ) : null}
            <div className={cn("absolute inset-0", tool === "draw" && "pointer-events-none")} style={{ containerType: "size" }}>
              {overlays.map((o) => (
                <span
                  key={o.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${o.type === "text" ? `Text "${o.text}"` : `Sticker ${o.emoji}`}. Drag or use arrow keys to move, Delete to remove.`}
                  aria-pressed={o.id === selectedId}
                  style={overlayStyle(o)}
                  className={cn(
                    overlayClass(o),
                    "pointer-events-auto cursor-grab touch-none rounded-lg px-1 active:cursor-grabbing",
                    o.id === selectedId && "outline-dashed outline-2 outline-offset-4 outline-white/80",
                  )}
                  onPointerDown={(e) => onOverlayDown(e, o.id)}
                  onPointerMove={onOverlayMove}
                  onPointerUp={onOverlayUp}
                  onPointerCancel={onOverlayUp}
                  onFocus={() => setSelectedId(o.id)}
                  onKeyDown={(e) => onOverlayKey(e, o)}
                  onWheel={(e) => {
                    const next = Math.min(maxSize(o), Math.max(0.02, o.size * (e.deltaY < 0 ? 1.08 : 0.92)));
                    updateOverlay(o.id, { size: next });
                  }}
                >
                  {o.type === "text" ? o.text : o.emoji}
                </span>
              ))}
            </div>
          </div>
        </FitFrame>

        {/* Top bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={onRetake}
            className="pointer-events-auto rounded-full bg-black/40 p-2.5 backdrop-blur hover:bg-black/60"
            aria-label="Discard and retake"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="pointer-events-auto flex flex-col gap-2" role="toolbar" aria-label="Editing tools" aria-orientation="vertical">
            {tools
              .filter((t) => isImage || !t.photoOnly)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTool((cur) => (cur === t.id ? "none" : t.id));
                    setSelectedId(null);
                  }}
                  aria-pressed={tool === t.id}
                  aria-label={t.label}
                  title={t.label}
                  className={cn("rounded-full p-2.5 backdrop-blur transition-colors", tool === t.id ? "bg-white text-black" : "bg-black/40 hover:bg-black/60")}
                >
                  <t.icon className="h-5 w-5" />
                </button>
              ))}
            {!isImage ? (
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Unmute preview" : "Mute preview"}
                className="rounded-full bg-black/40 p-2.5 backdrop-blur hover:bg-black/60"
              >
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Bottom panel */}
      <div className="space-y-3 bg-black px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={selected ? `sel-${selected.type}` : tool} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15 }}>
            {selected ? (
              <div className="space-y-3">
                {selected.type === "text" ? (
                  <>
                    <input
                      value={selected.text}
                      onChange={(e) => updateOverlay(selected.id, { text: e.target.value.slice(0, 200) })}
                      className="h-10 w-full rounded-xl bg-white/10 px-3 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
                      aria-label="Edit text"
                    />
                    <ColorRow colors={TEXT_COLORS} value={selected.color} onChange={(c) => updateOverlay(selected.id, { color: c })} label="Text colour" />
                  </>
                ) : null}
                <div className="flex items-center gap-3">
                  <label className="flex flex-1 items-center gap-2 text-xs font-semibold text-white/70">
                    Size
                    <input
                      type="range"
                      min={0.02}
                      max={maxSize(selected)}
                      step={0.005}
                      value={selected.size}
                      onChange={(e) => updateOverlay(selected.id, { size: Number(e.target.value) })}
                      className="flex-1 accent-white"
                    />
                  </label>
                  <label className="flex flex-1 items-center gap-2 text-xs font-semibold text-white/70">
                    Tilt
                    <input
                      type="range"
                      min={-45}
                      max={45}
                      step={1}
                      value={selected.rotation ?? 0}
                      onChange={(e) => updateOverlay(selected.id, { rotation: Number(e.target.value) })}
                      className="flex-1 accent-white"
                    />
                  </label>
                  <button type="button" onClick={() => removeOverlay(selected.id)} className="rounded-full bg-white/10 p-2.5 text-red-300 hover:bg-white/20" aria-label="Delete overlay">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : tool === "text" ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  addText();
                }}
              >
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    maxLength={200}
                    placeholder="Type something…"
                    className="h-10 flex-1 rounded-xl bg-white/10 px-3 text-sm text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
                    aria-label="Text to add"
                  />
                  <Button type="submit" size="md" variant="secondary" disabled={!draftText.trim()}>
                    Add
                  </Button>
                </div>
                <ColorRow colors={TEXT_COLORS} value={textColor} onChange={setTextColor} label="Text colour" />
              </form>
            ) : tool === "sticker" ? (
              <div className="grid grid-cols-10 gap-1" role="group" aria-label="Stickers">
                {STICKERS.map((s) => (
                  <button key={s} type="button" onClick={() => addSticker(s)} className="rounded-xl p-1 text-2xl hover:bg-white/10" aria-label={`Add ${s} sticker`}>
                    {s}
                  </button>
                ))}
              </div>
            ) : tool === "draw" ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <ColorRow colors={PEN_COLORS} value={penColor} onChange={setPenColor} label="Pen colour" />
                  <button
                    type="button"
                    onClick={() => setStrokes((s) => s.slice(0, -1))}
                    disabled={strokes.length === 0}
                    className="ml-auto flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20 disabled:opacity-40"
                  >
                    <Undo2 className="h-4 w-4" /> Undo
                  </button>
                </div>
                <div className="flex gap-2" role="radiogroup" aria-label="Pen size">
                  {PEN_SIZES.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={penSize === p.value}
                      onClick={() => setPenSize(p.value)}
                      className={cn("flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold", penSize === p.value ? "bg-white text-black" : "bg-white/10")}
                    >
                      <span className="rounded-full bg-current" style={{ width: p.value * 500, height: p.value * 500 }} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : tool === "adjust" ? (
              <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-1.5" role="radiogroup" aria-label="Crop">
                  {CROPS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={crop === c.id}
                      onClick={() => setCrop(c.id)}
                      className={cn("flex-1 rounded-xl py-2 text-xs font-bold", crop === c.id ? "bg-white text-black" : "bg-white/10 hover:bg-white/20")}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setRotation((r) => (((r + 90) % 360) as Rotation))}
                  className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20"
                  aria-label="Rotate 90 degrees"
                >
                  <RotateCw className="h-4 w-4" /> 90°
                </button>
              </div>
            ) : tool === "filter" ? (
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar" role="radiogroup" aria-label="Filters">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className="flex shrink-0 flex-col items-center gap-1 text-[11px] font-bold"
                  >
                    <span className={cn("block h-14 w-14 overflow-hidden rounded-xl ring-2", filter === f.id ? "ring-white" : "ring-transparent")}>
                      {thumb ? (
                        // Local preview of the user's own photo (data URL, never uploaded as-is).
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="h-full w-full object-cover" style={{ filter: filterCss(f.id) }} />
                      ) : null}
                    </span>
                    {f.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs text-white/60">
                {isImage
                  ? "Add text, stickers or drawings, crop, rotate and apply a filter."
                  : "Add text and stickers — they're shown on top of your video. Drawing, crop and filters are available for photos."}
              </p>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={onRetake} className="text-white/80 hover:bg-white/10 hover:text-white">
            Retake
          </Button>
          <Button variant="gradient" size="lg" onClick={() => void finish()} loading={exporting}>
            Next <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ColorRow({ colors, value, onChange, label }: { colors: readonly string[]; value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div className="flex gap-2" role="radiogroup" aria-label={label}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn("h-7 w-7 rounded-full border-2 transition-transform", value === c ? "scale-110 border-white" : "border-white/30")}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}
