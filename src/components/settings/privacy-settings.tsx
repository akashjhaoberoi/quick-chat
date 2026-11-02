"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { useConfirm } from "@/components/ui/confirm";
import { useMe } from "@/components/providers/session-provider";
import { useTheme, type ThemePreference } from "@/components/providers/theme-provider";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn, displayName, relativeTime } from "@/lib/utils";
import type { Profile, UserSettings } from "@/types/models";
import { SettingsPageHeader } from "./settings-shell";
import { ChoiceGroup, SettingsSection, useUpdateSettings } from "./settings-ui";

export function PrivacySettings() {
  const me = useMe();
  const s = me.settings;
  const update = useUpdateSettings();
  const queryClient = useQueryClient();
  const privacy = useMutation({
    mutationFn: (isPrivate: boolean) => api.patch<Profile>("/api/profiles/me", { isPrivate }),
    onSuccess: async (_d, isPrivate) => {
      await queryClient.invalidateQueries({ queryKey: qk.me });
      void queryClient.invalidateQueries({ queryKey: qk.profile(me.profile.username) });
      toast.success(isPrivate ? "Your account is now private" : "Your account is now public");
    },
  });
  const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => update.mutate({ [key]: value } as Partial<UserSettings>);

  return (
    <div className="space-y-4 px-4 pb-10 md:px-0">
      <SettingsPageHeader title="Privacy" description="Control who can reach you and what others can see." />

      <SettingsSection title="Profile">
        <div className="divide-y divide-border">
          <Switch
            checked={me.profile.is_private}
            disabled={privacy.isPending}
            onChange={(v) => privacy.mutate(v)}
            label="Private account"
            description="Only friends can see your cover, friends list and posts, or follow you. Your name, username and photo stay visible so people can add you."
          />
          <Switch
            checked={s.discoverable}
            onChange={(v) => set("discoverable", v)}
            label="Appear in search and suggestions"
            description="When off, people can only add you if they already know your exact username."
          />
          <Switch checked={s.show_score} onChange={(v) => set("show_score", v)} label="Show my Snap score" description="Your score is always visible to you." />
        </div>
      </SettingsSection>

      <SettingsSection title="Contact">
        <div className="divide-y divide-border">
          <ChoiceGroup
            label="Who can message me"
            value={s.who_can_message}
            onChange={(v) => set("who_can_message", v)}
            options={[
              { value: "friends", label: "Friends only", description: "Recommended" },
              { value: "everyone", label: "Everyone", description: "Anyone who isn't blocked" },
            ]}
          />
          <ChoiceGroup
            label="Who can send me friend requests"
            value={s.who_can_add}
            onChange={(v) => set("who_can_add", v)}
            options={[
              { value: "everyone", label: "Everyone" },
              { value: "friends_of_friends", label: "Friends of friends" },
              { value: "nobody", label: "Nobody" },
            ]}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Activity">
        <div className="divide-y divide-border">
          <ChoiceGroup
            label="Who can see when I was last active"
            description="Controls the “Online” / “Active 5m ago” label others see on your profile and in chats."
            value={s.last_active_visibility}
            onChange={(v) => set("last_active_visibility", v)}
            options={[
              { value: "everyone", label: "Everyone" },
              { value: "friends", label: "Friends" },
              { value: "nobody", label: "Nobody" },
            ]}
          />
          <Switch
            checked={s.read_receipts}
            onChange={(v) => set("read_receipts", v)}
            label="Read receipts"
            description="Let people see when you've read their messages in one-to-one chats."
          />
        </div>
      </SettingsSection>

      <SettingsSection title="Stories & location">
        <div className="divide-y divide-border">
          <ChoiceGroup
            label="Default audience for new Stories"
            description="You can still choose a different audience each time you post."
            value={s.story_default_audience}
            onChange={(v) => set("story_default_audience", v)}
            options={[
              { value: "friends", label: "Friends" },
              { value: "public", label: "Public", description: "Anyone on Quick Chat" },
            ]}
          />
          <Switch
            checked={s.location_sharing}
            onChange={(v) => set("location_sharing", v)}
            label="Allow live location sharing"
            description="Enables sharing your location in chats. Your location is only ever shared when you explicitly start a share, and you can stop at any time."
          />
        </div>
      </SettingsSection>

      <p className="px-1 text-xs text-muted">
        Blocking someone hides you from each other everywhere. Manage the list in{" "}
        <Link href="/settings/blocked" className="font-semibold text-brand hover:underline">
          Blocked accounts
        </Link>
        .
      </p>
    </div>
  );
}

const THEMES: { value: ThemePreference; label: string; icon: typeof Sun; description: string }[] = [
  { value: "system", label: "System", icon: Monitor, description: "Match your device" },
  { value: "light", label: "Light", icon: Sun, description: "Bright and clean" },
  { value: "dark", label: "Dark", icon: Moon, description: "Easy on the eyes" },
];

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const update = useUpdateSettings();
  return (
    <div className="space-y-4 px-4 pb-10 md:px-0">
      <SettingsPageHeader title="Appearance" description="Your choice is saved to your account and applied when you sign in on other devices." />
      <SettingsSection title="Theme">
        <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
          {THEMES.map(({ value, label, icon: Icon, description }) => {
            const active = theme === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setTheme(value);
                  update.mutate({ theme: value });
                }}
                className={cn(
                  "overflow-hidden rounded-2xl border text-left transition-colors",
                  active ? "border-brand ring-4 ring-[var(--ring)]" : "border-border hover:border-brand/50",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-20 items-end gap-1.5 p-3",
                    value === "dark" ? "bg-[#0b0a12]" : value === "light" ? "bg-[#f6f5fb]" : "bg-gradient-to-r from-[#f6f5fb] from-50% to-[#0b0a12] to-50%",
                  )}
                >
                  <span className="h-6 w-16 rounded-xl rounded-bl-sm bg-[#7c5cff]" />
                  <span className={cn("h-4 w-10 rounded-xl", value === "dark" ? "bg-[#242134]" : "bg-white shadow")} />
                </span>
                <span className="flex items-center gap-2 px-3 py-2.5">
                  <Icon className="h-4 w-4 text-brand" />
                  <span>
                    <span className="block text-sm font-semibold">{label}</span>
                    <span className="block text-xs text-muted">{description}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </SettingsSection>
    </div>
  );
}

type BlockedUser = { id: string; username: string; display_name: string; avatar_media_id: string | null; blocked_at: string };

export function BlockedSettings() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const list = useQuery({
    queryKey: qk.blocked,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient().rpc("my_blocked_users");
      if (error) throw error;
      return (data ?? []) as BlockedUser[];
    },
  });
  const unblock = useMutation({
    mutationFn: (id: string) => api.delete(`/api/users/${id}/block`),
    onSuccess: async () => {
      toast.success("Unblocked");
      await queryClient.invalidateQueries({ queryKey: qk.blocked });
    },
  });

  return (
    <div className="space-y-4 px-4 pb-10 md:px-0">
      <SettingsPageHeader title="Blocked accounts" description="Blocked people can't find your profile, message or call you, or see your Stories." />
      <SettingsSection title={list.data ? `${list.data.length} blocked` : "Blocked"}>
        {list.isPending ? (
          <ListSkeleton rows={3} />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.length === 0 ? (
          <EmptyState icon={<Ban />} title="You haven't blocked anyone" description="You can block someone from their profile or a chat." />
        ) : (
          <ul className="divide-y divide-border">
            {list.data.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-3">
                <Avatar mediaId={u.avatar_media_id} name={displayName(u)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{displayName(u)}</span>
                  <span className="block truncate text-xs text-muted">
                    @{u.username} · blocked {relativeTime(u.blocked_at)}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  loading={unblock.isPending && unblock.variables === u.id}
                  onClick={async () => {
                    if (await confirm({ title: `Unblock ${displayName(u)}?`, description: "They'll be able to find you and send you requests again. You won't automatically become friends.", confirmLabel: "Unblock" })) {
                      unblock.mutate(u.id);
                    }
                  }}
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
