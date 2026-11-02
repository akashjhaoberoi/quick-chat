"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, FileClock, Flag, Gauge, Image as ImageIcon, LayoutDashboard, Megaphone, Menu as MenuIcon, Moon, Scale, Settings,
  Sun, Users, X,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { SessionProvider, useSession } from "@/components/providers/session-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { Avatar } from "@/components/ui/avatar";
import { api } from "@/lib/api/client";
import { cn, displayName } from "@/lib/utils";
import { AdminGate, useAdmin } from "./admin-gate";
import { adminKeys } from "./keys";
import { RoleBadge } from "./ui";
import { hasRole, type AdminRole, type AdminStats } from "./types";

type NavItem = { href: string; label: string; icon: typeof Users; min: AdminRole; badge?: "reports" | "appeals" };

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, min: "moderator" },
  { href: "/admin/users", label: "Users", icon: Users, min: "moderator" },
  { href: "/admin/reports", label: "Reports", icon: Flag, min: "moderator", badge: "reports" },
  { href: "/admin/appeals", label: "Appeals", icon: Scale, min: "moderator", badge: "appeals" },
  { href: "/admin/content", label: "Content", icon: ImageIcon, min: "moderator" },
  { href: "/admin/audit", label: "Audit log", icon: FileClock, min: "admin" },
  { href: "/admin/system", label: "System", icon: Gauge, min: "moderator" },
  { href: "/admin/settings", label: "Settings", icon: Settings, min: "admin" },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone, min: "admin" },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

function useStatsBadges() {
  const { data } = useQuery({
    queryKey: adminKeys.stats,
    queryFn: () => api.get<AdminStats>("/api/admin/stats"),
    refetchInterval: 60_000,
    meta: { silent: true },
  });
  return { reports: data?.reports_pending ?? 0, appeals: data?.appeals_pending ?? 0 };
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { role } = useAdmin();
  const badges = useStatsBadges();
  return (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {NAV.filter((i) => hasRole(role, i.min)).map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        const count = item.badge ? badges[item.badge] : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
              active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {count ? (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                <span className="sr-only">, </span>
                {count > 99 ? "99+" : count}
                <span className="sr-only"> pending</span>
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5 px-2">
      <LogoMark className="h-8 w-8" />
      <span className="font-display text-base font-extrabold leading-tight">
        Quick Chat <span className="block text-[11px] font-semibold text-muted">Admin console</span>
      </span>
    </Link>
  );
}

function ThemeToggle() {
  const { resolved, setTheme } = useTheme();
  const dark = resolved === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="rounded-full p-2 text-ink-2 hover:bg-surface-2"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { role } = useAdmin();
  const { me } = useSession();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer]);

  return (
    <div className="flex min-h-dvh bg-bg">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface px-3 py-5 lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <NavLinks />
        </div>
      </aside>

      {drawer ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close navigation" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 bg-surface px-3 py-5 shadow-[var(--shadow-pop)]">
            <div className="flex items-center justify-between">
              <Brand />
              <button type="button" onClick={() => setDrawer(false)} className="rounded-full p-2 hover:bg-surface-2" aria-label="Close navigation">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <NavLinks onNavigate={() => setDrawer(false)} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/90 px-3 backdrop-blur-xl sm:px-5">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            className="rounded-full p-2 text-ink-2 hover:bg-surface-2 lg:hidden"
            aria-label="Open navigation"
            aria-expanded={drawer}
          >
            <MenuIcon className="h-5 w-5" />
          </button>
          <span className="truncate text-sm font-semibold text-muted lg:hidden">
            {NAV.find((n) => isActive(pathname, n.href))?.label ?? "Admin"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <RoleBadge role={role} />
            <ThemeToggle />
            <Link
              href="/home"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Back to app</span>
              <span className="sm:hidden">App</span>
            </Link>
            {me ? <Avatar mediaId={me.profile.avatar_media_id} name={displayName(me.profile)} size="sm" /> : null}
          </div>
        </header>
        <main id="admin-main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Admin dashboard shell: session, server-verified role/MFA gate, sidebar + top bar. */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AdminGate>
        <Frame>{children}</Frame>
      </AdminGate>
    </SessionProvider>
  );
}
