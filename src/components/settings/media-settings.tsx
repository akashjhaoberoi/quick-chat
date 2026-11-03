"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/controls";
import { useMe } from "@/components/providers/session-provider";
import type { UserSettings } from "@/types/models";
import { SettingsPageHeader } from "./settings-shell";
import { ChoiceGroup, SettingsSection, useUpdateSettings } from "./settings-ui";

const VISIBILITY = [
  { value: "everyone", label: "Everyone", description: "Anyone signed in who you haven't blocked" },
  { value: "friends", label: "Friends" },
  { value: "nobody", label: "Only me" },
] as const;

/**
 * Privacy & media protection. Every option is enforced by the server
 * (database access rules and the media API), not just hidden in the app.
 */
export function MediaProtectionSettings() {
  const me = useMe();
  const s = me.settings;
  const update = useUpdateSettings();
  const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => update.mutate({ [key]: value } as Partial<UserSettings>);
  const screenshotAlerts = s.notification_prefs?.snap_screenshot !== false;

  return (
    <div className="space-y-4 px-4 pb-10 md:px-0">
      <SettingsPageHeader title="Media protection" description="Who can see your photos, and how the photos and videos you send are protected." />

      <SettingsSection title="Profile photos">
        <div className="divide-y divide-border">
          <ChoiceGroup
            label="Who can see my profile photo"
            description="Everyone else sees your initials instead."
            value={s.avatar_visibility ?? "everyone"}
            onChange={(v) => set("avatar_visibility", v)}
            options={[...VISIBILITY]}
          />
          <ChoiceGroup
            label="Who can see my cover photo"
            description={me.profile.is_private ? "Your account is private, so only friends see your cover even when this is “Everyone”." : undefined}
            value={s.cover_visibility ?? "everyone"}
            onChange={(v) => set("cover_visibility", v)}
            options={[...VISIBILITY]}
          />
          <Switch
            checked={s.media_watermark ?? true}
            onChange={(v) => set("media_watermark", v)}
            label="Watermark my photos for viewers"
            description="People viewing your profile and cover photos see their own username and the time over the photo, which discourages re-sharing."
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Photos and videos I send">
        <div className="divide-y divide-border">
          <ChoiceGroup
            label="Default protection"
            description="You can still pick a different option each time you send."
            value={s.default_media_mode ?? "normal"}
            onChange={(v) => set("default_media_mode", v)}
            options={[
              { value: "normal", label: "Normal", description: "Can be saved and forwarded" },
              { value: "protected", label: "Protected", description: "No download or forwarding; watermarked with the viewer's name" },
              { value: "view_once", label: "View once", description: "Opens one time for a short window, then it's deleted" },
              { value: "disappearing", label: "24 hours", description: "Deleted for everyone after a day" },
            ]}
          />
          <Switch
            checked={screenshotAlerts}
            onChange={(v) => set("notification_prefs", { ...s.notification_prefs, snap_screenshot: v })}
            label="Screenshot alerts"
            description="Tell me when someone may have screenshotted my Snaps or protected media. Only some computer shortcuts can be detected; phone screenshots and screen recordings can't."
          />
        </div>
      </SettingsSection>

      <SettingsSection title="What protection can and can't do">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>Your photos and videos are stored privately. Each view needs your permission rules to pass and gets a link that expires within minutes (one minute for protected media).</li>
          <li>Protected and view-once media can&apos;t be downloaded or forwarded, the usual right-click, drag and long-press saving is blocked, and it&apos;s hidden while Quick Chat is in the background.</li>
          <li>
            No website can fully stop screenshots, screen recording or someone photographing the screen. Watermarks and screenshot alerts discourage
            it; only share what you&apos;re comfortable with someone keeping.
          </li>
        </ul>
      </SettingsSection>

      <SettingsSection title="Related">
        <div className="divide-y divide-border">
          <Link href="/settings/security" className="flex items-center justify-between py-3 text-sm font-semibold hover:text-brand">
            Active sessions and login activity <ChevronRight className="h-4 w-4 text-muted" />
          </Link>
          <Link href="/settings/blocked" className="flex items-center justify-between py-3 text-sm font-semibold hover:text-brand">
            Blocked accounts <ChevronRight className="h-4 w-4 text-muted" />
          </Link>
          <Link href="/settings/privacy" className="flex items-center justify-between py-3 text-sm font-semibold hover:text-brand">
            Private account and who can contact me <ChevronRight className="h-4 w-4 text-muted" />
          </Link>
        </div>
      </SettingsSection>
    </div>
  );
}
