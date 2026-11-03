"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Ban, Loader2, Lock, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { backgroundSwatchCss, VIRTUAL_BACKGROUNDS } from "@/lib/video-effects/backgrounds";
import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  isPremiumEffect,
  previewCssFilter,
  VIDEO_EFFECTS,
  type VideoEffectDef,
  type VideoEffectSelection,
  type VideoEffectSupport,
} from "@/lib/video-effects/effects";
import type { VideoEffectsStatus } from "./use-video-effects";

export type EffectsMenuProps = {
  selection: VideoEffectSelection;
  support: VideoEffectSupport;
  status?: VideoEffectsStatus;
  cameraOn: boolean;
  onChoose: (next: Partial<VideoEffectSelection>) => void;
  /** When false, effects in PREMIUM_VIDEO_EFFECTS are shown locked. Default true. */
  premiumUnlocked?: boolean;
  /** Called when a locked premium effect is tapped. */
  onUpgrade?: () => void;
  disabled?: boolean;
};

/** Sample "scene" the filter thumbnails are rendered over (content, not theme). */
const THUMB_SCENE = "radial-gradient(circle at 50% 38%, #f2c6a5 0 22%, transparent 23%), linear-gradient(160deg, #8fb6e0 0%, #c9a7d8 55%, #6b8f71 100%)";

/**
 * Effects control for the call screen: a round control button that opens a
 * small sheet above the controls bar. Render it as a direct child of the
 * (relatively positioned) controls bar — the sheet positions itself against it.
 */
export function EffectsMenu({
  selection,
  support,
  status = "idle",
  cameraOn,
  onChoose,
  premiumUnlocked = true,
  onUpgrade,
  disabled,
}: EffectsMenuProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const anyEffect = selection.effect !== "none";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (def: VideoEffectDef) => {
    if (!premiumUnlocked && isPremiumEffect(def.id)) {
      onUpgrade?.();
      return;
    }
    onChoose({ effect: def.id });
  };

  const colorEffects = VIDEO_EFFECTS.filter((e) => e.kind !== "background");
  const backgroundEffects = VIDEO_EFFECTS.filter((e) => e.kind === "background");
  const vbLocked = !premiumUnlocked && isPremiumEffect("virtual-background");

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label="Video effects"
        title="Video effects"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={cn(
          "relative flex h-14 w-14 items-center justify-center rounded-full transition-[transform,background-color] active:scale-95 disabled:opacity-40 [&>svg]:h-6 [&>svg]:w-6",
          open ? "bg-white text-[#14121e] hover:bg-white/90" : "bg-white/15 text-white hover:bg-white/25",
        )}
      >
        {status === "loading" ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
        {anyEffect ? <span aria-hidden className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-black/40" /> : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label="Video effects"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute inset-x-0 bottom-full z-50 mx-auto mb-2 max-h-[min(70vh,34rem)] w-[min(24rem,calc(100%-2rem))] overflow-y-auto rounded-3xl border border-border bg-surface p-4 text-ink shadow-[var(--shadow-pop)]"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-bold">Effects</h2>
                <p className="text-xs text-muted">Applied on your device — others see the result.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close effects" className="-m-1 rounded-full p-1.5 text-muted hover:bg-surface-2">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!cameraOn ? <Notice>Your camera is off. Your choice applies when you turn it on.</Notice> : null}

            <Section title="Filters">
              {!support.color ? (
                <Notice>Filters need WebGL video processing, which this browser doesn&apos;t provide.</Notice>
              ) : null}
              <div className="grid grid-cols-4 gap-2">
                {colorEffects.map((def) => (
                  <EffectTile
                    key={def.id}
                    def={def}
                    selected={selection.effect === def.id}
                    locked={!premiumUnlocked && isPremiumEffect(def.id)}
                    disabled={def.kind === "color" && !support.color}
                    onClick={() => pick(def)}
                    thumb={
                      def.id === "none" ? (
                        <span className="flex h-full w-full items-center justify-center bg-surface-3 text-muted">
                          <Ban className="h-5 w-5" aria-hidden />
                        </span>
                      ) : (
                        <span
                          className="block h-full w-full"
                          style={{ background: THUMB_SCENE, filter: previewCssFilter(def.id, selection.brightness) }}
                        />
                      )
                    }
                  />
                ))}
              </div>
              {selection.effect === "brightness" && support.color ? (
                <label className="mt-3 flex items-center gap-3 text-xs font-semibold text-ink-2">
                  <span className="shrink-0">Brightness</span>
                  <input
                    type="range"
                    min={BRIGHTNESS_MIN}
                    max={BRIGHTNESS_MAX}
                    step={0.05}
                    value={selection.brightness}
                    onChange={(e) => onChoose({ brightness: Number(e.target.value) })}
                    className="h-2 w-full cursor-pointer accent-brand"
                    aria-valuetext={`${Math.round(selection.brightness * 100)}%`}
                  />
                  <span className="w-10 shrink-0 text-right tabular-nums text-muted">{Math.round(selection.brightness * 100)}%</span>
                </label>
              ) : null}
            </Section>

            <Section title="Background">
              {!support.background ? (
                <Notice>
                  Background effects aren&apos;t supported in this browser (they need WebGL2, OffscreenCanvas and WebCodecs). Try a recent Chrome, Edge or
                  Firefox.
                </Notice>
              ) : support.lowPower ? (
                <Notice>This device has few processor cores — background effects may be slow or make your video choppy.</Notice>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                {backgroundEffects.map((def) => (
                  <EffectTile
                    key={def.id}
                    def={def}
                    wide
                    selected={selection.effect === def.id}
                    locked={!premiumUnlocked && isPremiumEffect(def.id)}
                    disabled={!support.background}
                    onClick={() => pick(def)}
                    thumb={
                      <span
                        className="block h-full w-full"
                        style={{
                          background: def.id === "background-blur" ? THUMB_SCENE : backgroundSwatchCss(VIRTUAL_BACKGROUNDS[0]),
                          filter: def.id === "background-blur" ? "blur(3px)" : undefined,
                        }}
                      />
                    }
                  />
                ))}
              </div>
              {selection.effect === "virtual-background" && support.background && !vbLocked ? (
                <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Background image">
                  {VIRTUAL_BACKGROUNDS.map((bg) => (
                    <button
                      key={bg.id}
                      type="button"
                      role="radio"
                      aria-checked={selection.background === bg.id}
                      aria-label={bg.label}
                      title={bg.label}
                      onClick={() => onChoose({ background: bg.id })}
                      className={cn(
                        "h-10 w-14 rounded-xl ring-2 ring-offset-2 ring-offset-surface transition-shadow",
                        selection.background === bg.id ? "ring-brand" : "ring-transparent hover:ring-border",
                      )}
                      style={{ background: backgroundSwatchCss(bg) }}
                    />
                  ))}
                </div>
              ) : null}
              {status === "loading" ? (
                <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading background effect…
                </p>
              ) : null}
            </Section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 first-of-type:mt-0">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return <p className="mb-2 rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-2">{children}</p>;
}

function EffectTile({
  def,
  selected,
  locked,
  disabled,
  wide,
  thumb,
  onClick,
}: {
  def: VideoEffectDef;
  selected: boolean;
  locked: boolean;
  disabled: boolean;
  wide?: boolean;
  thumb: ReactNode;
  onClick: () => void;
}) {
  const label = def.label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={locked ? `${label} (Premium)` : label}
      title={def.description ?? label}
      data-effect={def.id}
      className="group flex min-w-0 flex-col items-center gap-1 rounded-2xl p-0.5 text-center disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span
        className={cn(
          "relative block w-full overflow-hidden rounded-xl ring-2 transition-shadow",
          wide ? "aspect-[16/9]" : "aspect-square",
          selected ? "ring-brand" : "ring-transparent group-hover:ring-border",
        )}
      >
        {thumb}
        {locked ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
            <Lock className="h-4 w-4" aria-hidden />
          </span>
        ) : null}
      </span>
      <span className="w-full truncate text-[11px] font-semibold leading-tight text-ink-2">{label}</span>
      {locked ? <span className="-mt-0.5 rounded-full bg-brand-soft px-1.5 text-[10px] font-bold text-brand">Premium</span> : null}
    </button>
  );
}
