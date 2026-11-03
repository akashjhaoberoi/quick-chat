"use client";

import { useState } from "react";
import { BellOff, BellRing, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Switch } from "@/components/ui/controls";
import { SetupNotice } from "@/components/ui/feedback";
import { useMe } from "@/components/providers/session-provider";
import { useAppConfig } from "@/hooks/use-app-config";
import { errorMessage } from "@/lib/api/client";
import { disablePush, enablePush, pushSupport, type PushSupport } from "@/lib/push-client";
import type { NotificationType } from "@/types/models";
import { SettingsPageHeader } from "./settings-shell";
import { SettingsSection, useUpdateSettings } from "./settings-ui";

const GROUPS: { title: string; items: { type: NotificationType; label: string; description?: string }[] }[] = [
  {
    title: "Messages & calls",
    items: [
      { type: "message", label: "New messages" },
      { type: "mention", label: "Mentions in groups" },
      { type: "group_invite", label: "Added to a group" },
      { type: "incoming_call", label: "Incoming calls" },
      { type: "missed_call", label: "Missed calls" },
    ],
  },
  {
    title: "Snaps & Stories",
    items: [
      { type: "snap", label: "New Snaps" },
      { type: "snap_opened", label: "Your Snap was opened" },
      { type: "snap_screenshot", label: "Screenshot alerts", description: "Best effort — browsers can't detect every screenshot or screen recording." },
      { type: "story_reaction", label: "Story reactions" },
      { type: "story_reply", label: "Story replies" },
      { type: "streak_reminder", label: "Streak reminders" },
    ],
  },
  {
    title: "Friends & Discover",
    items: [
      { type: "friend_request", label: "Friend requests" },
      { type: "friend_accepted", label: "Accepted requests" },
      { type: "follow", label: "New followers" },
      { type: "profile_view", label: "Profile views", description: "Someone viewed your profile." },
      { type: "post_like", label: "Likes on your posts" },
      { type: "post_comment", label: "Comments on your posts" },
      { type: "system", label: "Product announcements" },
    ],
  },
];

export function NotificationSettings() {
  const me = useMe();
  const s = me.settings;
  const update = useUpdateSettings();
  const config = useAppConfig();
  const [support, setSupport] = useState<PushSupport>(() => (typeof window === "undefined" ? "unsupported" : pushSupport()));
  const [pushBusy, setPushBusy] = useState(false);
  const [hasToken, setHasToken] = useState(() => {
    try {
      return typeof window !== "undefined" && Boolean(localStorage.getItem("qc-push-token"));
    } catch {
      return false;
    }
  });

  const prefs = s.notification_prefs ?? {};
  const isOn = (t: NotificationType) => prefs[t] !== false;
  const toggle = (t: NotificationType, v: boolean) => update.mutate({ notification_prefs: { ...prefs, [t]: v } });

  async function turnOnPush() {
    setPushBusy(true);
    try {
      const ok = await enablePush();
      setSupport(pushSupport());
      if (ok) {
        setHasToken(true);
        if (!s.push_enabled) update.mutate({ push_enabled: true });
        toast.success("Push notifications enabled on this device");
      } else if (pushSupport() === "denied") {
        toast.error("Notifications are blocked in your browser settings.");
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPushBusy(false);
    }
  }

  async function turnOffPush() {
    setPushBusy(true);
    try {
      await disablePush();
      setHasToken(false);
      toast.success("Push notifications turned off on this device");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPushBusy(false);
    }
  }

  const pushConfigured = config.data?.features.push ?? false;

  return (
    <div className="space-y-4 px-4 pb-10 md:px-0">
      <SettingsPageHeader title="Notifications" description="Choose what you hear about and where." />

      <SettingsSection title="Push notifications" description="Alerts on this device, even when Quick Chat is closed.">
        {config.isPending ? null : !pushConfigured || support === "not_configured" ? (
          <SetupNotice feature="Push notifications" />
        ) : support === "unsupported" ? (
          <p className="rounded-2xl bg-surface-2 p-3 text-sm text-ink-2">
            This browser doesn&apos;t support web push. On iPhone and iPad, add Quick Chat to your Home Screen (Share → Add to Home Screen, iOS 16.4+) and
            open it from there to enable notifications.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                {support === "granted" && hasToken ? <BellRing className="h-4 w-4 text-success" /> : <BellOff className="h-4 w-4 text-muted" />}
                This device:{" "}
                {support === "denied" ? <Badge tone="danger">Blocked</Badge> : support === "granted" && hasToken ? <Badge tone="success">On</Badge> : <Badge tone="muted">Off</Badge>}
              </span>
              {support === "granted" && hasToken ? (
                <Button variant="outline" size="sm" loading={pushBusy} onClick={() => void turnOffPush()}>
                  Turn off on this device
                </Button>
              ) : support !== "denied" ? (
                <Button variant="gradient" size="sm" loading={pushBusy} onClick={() => void turnOnPush()}>
                  Enable on this device
                </Button>
              ) : null}
            </div>
            {support === "denied" ? (
              <p className="text-xs text-muted">You blocked notifications for this site. Allow them in your browser&apos;s site settings, then reload.</p>
            ) : null}
            <Switch
              checked={s.push_enabled}
              onChange={(v) => update.mutate({ push_enabled: v })}
              label="Send push notifications to my devices"
              description="Master switch for all devices. In-app notifications are unaffected."
            />
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          Browser limitations: delivery is best-effort and controlled by your browser and operating system. iOS requires installing the app to the Home
          Screen; some browsers block push in private windows; Focus/Do Not Disturb modes may silence alerts.
        </p>
      </SettingsSection>

      {GROUPS.map((g) => (
        <SettingsSection key={g.title} title={g.title}>
          <div className="divide-y divide-border">
            {g.items.map((i) => (
              <Switch key={i.type} checked={isOn(i.type)} onChange={(v) => toggle(i.type, v)} label={i.label} description={i.description} />
            ))}
          </div>
        </SettingsSection>
      ))}

      <SettingsSection title="Account & safety">
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between gap-4 py-3">
            <span>
              <span className="block text-sm font-semibold">Security and moderation notices</span>
              <span className="mt-0.5 block text-xs text-muted">New sign-ins, password changes and moderation decisions are always delivered in-app.</span>
            </span>
            <Lock className="h-4 w-4 shrink-0 text-muted" aria-label="Always on" />
          </div>
          <Switch
            checked={s.email_security_alerts}
            onChange={(v) => update.mutate({ email_security_alerts: v })}
            label="Email security alerts"
            description={
              config.data && !config.data.features.email
                ? "Email delivery isn't configured on this server yet, so no emails will be sent."
                : `Sent to ${me.user.email ?? "your email"} for new-device sign-ins and security changes.`
            }
          />
        </div>
      </SettingsSection>
    </div>
  );
}
