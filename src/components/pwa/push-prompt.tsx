"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BellRing, Download, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enablePush, pushSupport } from "@/lib/push-client";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "qc-prompt-dismissed";

/** Gentle, dismissible prompts for push notifications and app installation. */
export function PushPrompt() {
  const [kind, setKind] = useState<"push" | "install" | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = Number(localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now() - 7 * 86_400_000;
    } catch {
      // ignore
    }
    if (dismissed) return;
    const t = window.setTimeout(() => {
      if (pushSupport() === "default") setKind("push");
    }, 8000);
    const onInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setKind((k) => k ?? "install");
    };
    window.addEventListener("beforeinstallprompt", onInstall);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onInstall);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setKind(null);
  };

  const accept = async () => {
    setBusy(true);
    try {
      if (kind === "push") {
        const ok = await enablePush();
        toast[ok ? "success" : "info"](ok ? "Notifications enabled" : "Notifications were not enabled");
      } else if (installEvent) {
        await installEvent.prompt();
        await installEvent.userChoice;
      }
    } catch {
      toast.error("Couldn't complete that. You can try again from Settings.");
    } finally {
      setBusy(false);
      dismiss();
    }
  };

  return (
    <AnimatePresence>
      {kind ? (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-md items-center gap-3 rounded-3xl border border-border bg-surface p-3 shadow-[var(--shadow-pop)] md:bottom-6"
          role="dialog"
          aria-label={kind === "push" ? "Enable notifications" : "Install Quick Chat"}
        >
          <span className="brand-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white">
            {kind === "push" ? <BellRing className="h-5 w-5" /> : <Download className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{kind === "push" ? "Never miss a Snap" : "Install Quick Chat"}</p>
            <p className="text-xs text-muted">{kind === "push" ? "Get notified about messages, Snaps and calls." : "Add it to your home screen for a full-screen app."}</p>
          </div>
          <Button size="sm" onClick={accept} loading={busy}>
            {kind === "push" ? "Enable" : "Install"}
          </Button>
          <button type="button" onClick={dismiss} className="rounded-full p-1.5 text-muted hover:bg-surface-2" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
