"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** "center" modal on desktop; "sheet" slides up from the bottom (mobile-friendly). */
  variant?: "center" | "sheet" | "fullscreen";
  className?: string;
  hideClose?: boolean;
};

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input:not([disabled]),select,[tabindex]:not([tabindex="-1"])';

/** Accessible modal: focus trap, Escape to close, scroll lock, restores focus. */
export function Dialog({ open, onClose, title, description, children, footer, variant = "center", className, hideClose }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current)?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab" && panelRef.current) {
        const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  const panelClass =
    variant === "sheet"
      ? "fixed inset-x-0 bottom-0 max-h-[90dvh] rounded-t-3xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
      : variant === "fullscreen"
        ? "fixed inset-0 sm:inset-6 sm:rounded-3xl"
        : "fixed left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl";

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[100]">
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            className={cn("flex flex-col overflow-hidden border border-border bg-surface shadow-[var(--shadow-pop)] outline-none", panelClass, className)}
            initial={variant === "sheet" ? { y: 40, opacity: 0 } : { scale: 0.96, opacity: 0 }}
            animate={variant === "sheet" ? { y: 0, opacity: 1 } : { scale: 1, opacity: 1 }}
            exit={variant === "sheet" ? { y: 40, opacity: 0 } : { scale: 0.96, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          >
            {title || !hideClose ? (
              <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
                <div className="min-w-0">
                  {title ? (
                    <h2 id={titleId} className="font-display text-lg font-bold">
                      {title}
                    </h2>
                  ) : null}
                  {description ? (
                    <p id={descId} className="mt-1 text-sm text-muted">
                      {description}
                    </p>
                  ) : null}
                </div>
                {!hideClose ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className="-mr-1 -mt-1 rounded-full p-2 text-muted hover:bg-surface-2 hover:text-ink"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 scrollbar-thin">{children}</div>
            {footer ? <div className="flex justify-end gap-2 border-t border-border px-5 py-3 safe-bottom">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
