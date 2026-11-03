"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ban, Bell, ChevronRight, Lock, Palette, ShieldCheck, UserCog, type LucideIcon } from "lucide-react";
import { InstallButton } from "@/components/pwa/install-button";
import { cn } from "@/lib/utils";

export const SETTINGS_NAV: { href: string; label: string; description: string; icon: LucideIcon }[] = [
  { href: "/settings/account", label: "Account", description: "Email, deactivation, deletion, appeals", icon: UserCog },
  { href: "/settings/privacy", label: "Privacy", description: "Who can contact and find you", icon: Lock },
  { href: "/settings/notifications", label: "Notifications", description: "Push, in-app and email alerts", icon: Bell },
  { href: "/settings/security", label: "Security", description: "Two-factor, password, login activity", icon: ShieldCheck },
  { href: "/settings/appearance", label: "Appearance", description: "Light, dark or system theme", icon: Palette },
  { href: "/settings/blocked", label: "Blocked accounts", description: "People you've blocked", icon: Ban },
];

function SettingsNav({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Settings" className="space-y-1">
      {SETTINGS_NAV.map(({ href, label, description, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors",
              active ? "bg-brand-soft text-brand" : "text-ink hover:bg-surface-2",
            )}
          >
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", active ? "bg-brand text-white" : "bg-surface-2 text-ink-2")}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{label}</span>
              <span className="block truncate text-xs text-muted">{description}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted md:hidden" aria-hidden />
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop: nav column + content. Mobile: /settings shows the list, subpages show content. */
export function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isIndex = pathname === "/settings";
  return (
    <div className="mx-auto w-full max-w-6xl px-0 md:px-6 md:py-6">
      <div className="md:grid md:grid-cols-[18rem_1fr] md:gap-6">
        <aside className={cn("md:block", isIndex ? "block" : "hidden")}>
          <div className="px-4 pb-2 pt-4 md:px-0 md:pt-0">
            <h1 className="font-display text-2xl font-extrabold tracking-tight">Settings</h1>
          </div>
          <div className="px-2 md:sticky md:top-6 md:px-0">
            <SettingsNav pathname={pathname} />
            {/* Shown on every screen size (the overview card is desktop-only). */}
            <InstallButton variant="gradient" className="mt-3 w-full" label="Install Quick Chat" />
          </div>
        </aside>
        <div className={cn("min-w-0 md:block", isIndex ? "hidden" : "block")}>{children}</div>
      </div>
    </div>
  );
}

/** Title row for a settings subpage, with a back link to the list on mobile. */
export function SettingsPageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex items-start gap-2 px-4 pb-4 pt-4 md:px-0 md:pt-0">
      <Link href="/settings" className="-ml-2 mt-0.5 rounded-full p-2 text-ink-2 hover:bg-surface-2 md:hidden" aria-label="Back to settings">
        <ChevronRight className="h-5 w-5 rotate-180" />
      </Link>
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">{title}</h1>
        {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
      </div>
    </div>
  );
}
