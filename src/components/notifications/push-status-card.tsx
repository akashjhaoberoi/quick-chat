"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { BellOff, BellRing, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enablePush, pushSupport, type PushSupport } from "@/lib/push-client";

const noop = () => () => {};

/** Browser push permission status with an honest note on platform limits. */
export function PushStatusCard() {
  const initial = useSyncExternalStore<PushSupport | null>(noop, pushSupport, () => null);
  const [override, setOverride] = useState<PushSupport | null>(null);
  const [busy, setBusy] = useState(false);
  const status = override ?? initial;
  if (status === null) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const ok = await enablePush();
      setOverride(pushSupport());
      if (ok) toast.success("Push notifications enabled on this device");
      else toast.info("Notifications weren't enabled");
    } catch {
      toast.error("Couldn't enable notifications in this browser.");
    } finally {
      setBusy(false);
    }
  };

  const content: Record<PushSupport, { icon: ReactNode; title: string; body: string; tone: string }> = {
    granted: {
      icon: <CheckCircle2 className="h-5 w-5" />,
      title: "Push notifications are on",
      body: "This device will be notified about messages, Snaps, calls and requests while Quick Chat is closed.",
      tone: "bg-success/15 text-success",
    },
    default: {
      icon: <BellRing className="h-5 w-5" />,
      title: "Turn on push notifications",
      body: "Get notified about messages, Snaps and calls even when Quick Chat isn't open.",
      tone: "bg-brand-soft text-brand",
    },
    denied: {
      icon: <BellOff className="h-5 w-5" />,
      title: "Notifications are blocked",
      body: "You blocked notifications for this site. Allow them in your browser's site settings, then reload.",
      tone: "bg-danger-soft text-danger",
    },
    unsupported: {
      icon: <BellOff className="h-5 w-5" />,
      title: "Push isn't available in this browser",
      body: "On iPhone and iPad, add Quick Chat to your Home Screen (Share → Add to Home Screen) and open it from there to enable push.",
      tone: "bg-surface-3 text-muted",
    },
    not_configured: {
      icon: <Info className="h-5 w-5" />,
      title: "Push isn't configured on this server",
      body: "An administrator needs to add Firebase credentials. In-app notifications still work.",
      tone: "bg-surface-3 text-muted",
    },
  };
  const c = content[status];

  return (
    <div className="rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${c.tone}`}>{c.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{c.title}</p>
          <p className="mt-0.5 text-xs text-muted">{c.body}</p>
          <p className="mt-2 text-[11px] text-muted">
            Delivery is best-effort and controlled by your browser and operating system; private windows and battery savers may delay or drop
            notifications.
          </p>
        </div>
        {status === "default" ? (
          <Button size="sm" onClick={enable} loading={busy} className="shrink-0">
            Enable
          </Button>
        ) : null}
      </div>
    </div>
  );
}
