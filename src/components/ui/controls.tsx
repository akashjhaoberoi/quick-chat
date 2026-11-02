"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex cursor-pointer items-center justify-between gap-4 py-3", disabled && "cursor-not-allowed opacity-60")}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-muted">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand" : "bg-surface-3",
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 600, damping: 35 }}
          className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow", checked ? "right-1" : "left-1")}
        />
      </button>
    </label>
  );
}

export type TabItem<T extends string> = { value: T; label: ReactNode; count?: number };

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("flex gap-1 rounded-2xl bg-surface-2 p-1", className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => {
              const idx = items.findIndex((i) => i.value === value);
              if (e.key === "ArrowRight") onChange(items[(idx + 1) % items.length].value);
              if (e.key === "ArrowLeft") onChange(items[(idx - 1 + items.length) % items.length].value);
            }}
            className={cn(
              "relative flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {active ? (
              <motion.span layoutId={`tab-${ariaLabel ?? "tabs"}`} className="absolute inset-0 rounded-xl bg-surface shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 40 }} />
            ) : null}
            <span className="relative inline-flex items-center gap-1.5">
              {item.label}
              {item.count ? (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{item.count > 99 ? "99+" : item.count}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function Badge({ children, tone = "brand", className }: { children: ReactNode; tone?: "brand" | "accent" | "muted" | "success" | "danger" | "warning"; className?: string }) {
  const tones = {
    brand: "bg-brand-soft text-brand",
    accent: "bg-accent text-white",
    muted: "bg-surface-2 text-muted",
    success: "bg-success/15 text-success",
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning/15 text-warning",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold", tones[tone], className)}>{children}</span>;
}

export type MenuItem = { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean };

/** Small accessible popover menu (click or keyboard). */
export function Menu({ trigger, items, align = "end", label }: { trigger: ReactNode; items: MenuItem[]; align?: "start" | "end"; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative inline-flex">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)} className="inline-flex">
        {trigger}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className={cn(
              "absolute top-full z-50 mt-2 min-w-48 overflow-hidden rounded-2xl border border-border bg-surface p-1 shadow-[var(--shadow-pop)]",
              align === "end" ? "right-0" : "left-0",
            )}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-surface-2 disabled:opacity-50 [&>svg]:h-4 [&>svg]:w-4",
                  item.danger ? "text-danger" : "text-ink",
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
