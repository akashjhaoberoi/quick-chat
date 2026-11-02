"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Lock, Mail, ShieldAlert, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useMe } from "@/components/providers/session-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { displayName } from "@/lib/utils";
import { SettingsSection } from "./settings-ui";

/** Desktop landing pane for /settings: profile card + security checkup. */
export function SettingsOverview() {
  const me = useMe();
  const mfa = useQuery({
    queryKey: ["mfa"],
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient();
      const [factors, aal] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
      if (factors.error) throw factors.error;
      return { all: factors.data.all, totp: factors.data.totp ?? [], aal: aal.data?.currentLevel ?? null };
    },
  });
  const mfaOn = (mfa.data?.totp ?? []).some((f) => f.status === "verified");
  const checks = [
    {
      ok: mfaOn,
      icon: mfaOn ? ShieldCheck : ShieldAlert,
      title: mfaOn ? "Two-factor authentication is on" : "Turn on two-factor authentication",
      href: "/settings/security",
      pending: mfa.isPending,
    },
    { ok: me.settings.email_security_alerts, icon: Mail, title: me.settings.email_security_alerts ? "Email security alerts are on" : "Email security alerts are off", href: "/settings/notifications", pending: false },
    { ok: me.settings.who_can_message === "friends", icon: Lock, title: me.settings.who_can_message === "friends" ? "Only friends can message you" : "Anyone can message you", href: "/settings/privacy", pending: false },
  ];

  return (
    <div className="space-y-4 px-4 pb-10 md:px-0">
      <section className="flex items-center gap-4 rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]">
        <Avatar mediaId={me.profile.avatar_media_id} name={displayName(me.profile)} size="xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-bold">{displayName(me.profile)}</p>
          <p className="truncate text-sm text-muted">@{me.profile.username} · {me.user.email}</p>
        </div>
        <Link href={`/profile/${me.profile.username}`} className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold hover:bg-surface-3">
          View profile
        </Link>
      </section>
      <SettingsSection title="Security checkup" description="A quick look at how protected your account is.">
        <ul className="divide-y divide-border">
          {checks.map(({ ok, icon: Icon, title, href, pending }) => (
            <li key={title}>
              <Link href={href} className="flex items-center gap-3 py-3 hover:text-brand">
                <Icon className={ok ? "h-5 w-5 text-success" : "h-5 w-5 text-warning"} />
                <span className="flex-1 text-sm font-semibold">{pending ? "Checking…" : title}</span>
                <ChevronRight className="h-4 w-4 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </div>
  );
}
