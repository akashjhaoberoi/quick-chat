"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Search, Bell, Users, Phone, Zap, Settings, User, Shield, WifiOff, Megaphone } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Avatar } from "@/components/ui/avatar";
import { Menu } from "@/components/ui/controls";
import { Spinner } from "@/components/ui/feedback";
import { SessionProvider, useSession } from "@/components/providers/session-provider";
import { RealtimeProvider } from "@/components/providers/realtime-provider";
import { IncomingCallOverlay } from "@/components/calls/incoming-call-overlay";
import { PushPrompt } from "@/components/pwa/push-prompt";
import { NotificationToaster } from "@/components/notifications/notification-toaster";
import { useNavBadges } from "@/hooks/use-badges";
import { useOnline } from "@/hooks/use-online";
import { useAppConfig } from "@/hooks/use-app-config";
import { cn, displayName } from "@/lib/utils";
import { ADMIN_NAV, IMMERSIVE_PREFIXES, isActive, MOBILE_NAV, NO_BOTTOM_NAV_PATTERNS, PRIMARY_NAV, type NavItem } from "./nav-items";

function BadgeDot({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-surface">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function SidebarLink({ item, badge, pathname }: { item: NavItem; badge: number; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-semibold transition-colors",
        active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      <span className="relative">
        <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} />
        <BadgeDot count={badge} />
      </span>
      <span className="hidden xl:inline">{item.label}</span>
    </Link>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { me, signOut } = useSession();
  const badges = useNavBadges(me!.user.id);
  const items = me?.adminRole ? [...PRIMARY_NAV, ADMIN_NAV] : PRIMARY_NAV;
  return (
    <aside className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col border-r border-border bg-surface px-3 py-5 md:flex xl:w-64">
      <Link href="/home" className="mb-6 px-2" aria-label="Quick Chat home">
        <span className="xl:hidden">
          <LogoMark className="h-9 w-9" />
        </span>
        <span className="hidden xl:inline">
          <Logo />
        </span>
      </Link>
      <Link
        href="/search"
        className="mb-3 flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5 text-sm text-muted hover:text-ink"
        aria-label="Search"
      >
        <Search className="h-5 w-5" />
        <span className="hidden xl:inline">Search Quick Chat</span>
      </Link>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto no-scrollbar" aria-label="Main">
        {items.map((item) => (
          <SidebarLink
            key={item.href}
            item={item}
            pathname={pathname}
            badge={item.badge ? badges[item.badge] : 0}
          />
        ))}
      </nav>
      <div className="mt-3 flex items-center gap-3 rounded-2xl p-2 xl:bg-surface-2">
        <Avatar mediaId={me?.profile.avatar_media_id} name={displayName(me?.profile)} size="sm" />
        <div className="hidden min-w-0 flex-1 xl:block">
          <p className="truncate text-sm font-bold">{displayName(me?.profile)}</p>
          <p className="truncate text-xs text-muted">@{me?.profile.username}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="hidden rounded-full p-2 text-muted hover:bg-surface-3 hover:text-ink xl:inline-flex"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}

function MobileHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { me, signOut } = useSession();
  const badges = useNavBadges(me!.user.id);
  if (IMMERSIVE_PREFIXES.some((p) => pathname.startsWith(p)) || NO_BOTTOM_NAV_PATTERNS.some((r) => r.test(pathname))) return null;
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/85 px-3 backdrop-blur-xl md:hidden">
      <Link href="/home" aria-label="Quick Chat home">
        <Logo className="[&_span.text-xl]:text-lg" />
      </Link>
      <div className="flex items-center gap-1">
        <Link href="/search" className="rounded-full p-2.5 text-ink-2 hover:bg-surface-2" aria-label="Search">
          <Search className="h-5 w-5" />
        </Link>
        <Link href="/notifications" className="relative rounded-full p-2.5 text-ink-2 hover:bg-surface-2" aria-label={`Notifications${badges.notifications ? `, ${badges.notifications} unread` : ""}`}>
          <Bell className="h-5 w-5" />
          <span className="absolute right-1 top-1">
            <BadgeDot count={badges.notifications} />
          </span>
        </Link>
        <Menu
          label="Account menu"
          trigger={
            <span className="relative rounded-full p-1">
              <Avatar mediaId={me?.profile.avatar_media_id} name={displayName(me?.profile)} size="sm" />
              <span className="absolute -right-0.5 -top-0.5">
                <BadgeDot count={badges.requests + badges.snaps} />
              </span>
            </span>
          }
          items={[
            { label: "Profile", icon: <User />, onSelect: () => router.push("/profile") },
            { label: `Snaps${badges.snaps ? ` (${badges.snaps})` : ""}`, icon: <Zap />, onSelect: () => router.push("/snaps") },
            { label: `Friends${badges.requests ? ` (${badges.requests})` : ""}`, icon: <Users />, onSelect: () => router.push("/friends") },
            { label: "Calls", icon: <Phone />, onSelect: () => router.push("/calls") },
            { label: "Settings", icon: <Settings />, onSelect: () => router.push("/settings") },
            ...(me?.adminRole ? [{ label: "Admin", icon: <Shield />, onSelect: () => router.push("/admin") }] : []),
            { label: "Sign out", icon: <LogOut />, onSelect: () => void signOut(), danger: true },
          ]}
        />
      </div>
    </header>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const { me } = useSession();
  const badges = useNavBadges(me!.user.id);
  if (IMMERSIVE_PREFIXES.some((p) => pathname.startsWith(p)) || NO_BOTTOM_NAV_PATTERNS.some((r) => r.test(pathname))) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/90 backdrop-blur-xl safe-bottom md:hidden" aria-label="Main">
      <ul className="mx-auto flex h-16 max-w-md items-center justify-around px-2">
        {MOBILE_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          const isCamera = item.href === "/camera";
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1.5 text-[10px] font-bold",
                  isCamera ? "-mt-6" : active ? "text-brand" : "text-muted",
                )}
              >
                {isCamera ? (
                  <span className="brand-gradient flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[var(--shadow-pop)] ring-4 ring-bg">
                    <Icon className="h-6 w-6" />
                  </span>
                ) : (
                  <span className="relative">
                    <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 2} />
                    <BadgeDot count={item.badge ? badges[item.badge] : 0} />
                  </span>
                )}
                {!isCamera && <span>{item.label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function StatusBanners() {
  const online = useOnline();
  const config = useAppConfig();
  const announcement = config.data?.announcements?.[0];
  return (
    <>
      {!online ? (
        <div role="status" className="flex items-center justify-center gap-2 bg-warning px-3 py-1.5 text-xs font-bold text-black">
          <WifiOff className="h-3.5 w-3.5" /> You&apos;re offline — messages will send when you reconnect.
        </div>
      ) : null}
      {config.data?.maintenance.enabled ? (
        <div role="status" className="bg-danger px-3 py-1.5 text-center text-xs font-bold text-white">
          {config.data.maintenance.message || "Quick Chat is in maintenance mode. Some actions are temporarily unavailable."}
        </div>
      ) : null}
      {announcement ? (
        <div role="status" className={cn("flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold", announcement.level === "info" ? "bg-brand-soft text-brand" : "bg-warning/20 text-ink")}>
          <Megaphone className="h-3.5 w-3.5" />
          <span className="truncate">
            <strong>{announcement.title}</strong> {announcement.body}
          </span>
        </div>
      ) : null}
    </>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Suspense fallback={<div className="hidden w-[76px] md:block xl:w-64" />}>
        <Sidebar />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusBanners />
        <Suspense fallback={<div className="h-14 md:hidden" />}>
          <MobileHeader />
        </Suspense>
        <main id="main" className="min-w-0 flex-1 pb-20 md:pb-0">
          {children}
        </main>
      </div>
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
      <IncomingCallOverlay />
      <NotificationToaster />
      <PushPrompt />
    </div>
  );
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <LogoMark className="h-14 w-14 animate-pulse" />
      <Spinner />
    </div>
  );
}

/** Redirects to onboarding / suspension pages and waits for the session. */
function AuthGate({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  const router = useRouter();
  const status = me?.profile.status;
  const needsOnboarding = me && !me.profile.onboarded;
  const blocked = status === "suspended" || status === "banned";

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace("/login");
    else if (blocked) router.replace("/suspended");
    else if (needsOnboarding) router.replace("/onboarding");
  }, [loading, me, blocked, needsOnboarding, router]);

  if (loading || !me || blocked || needsOnboarding) return <FullScreenLoader />;
  return (
    <RealtimeProvider userId={me.user.id}>
      <ShellFrame>{children}</ShellFrame>
    </RealtimeProvider>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2">
        Skip to content
      </a>
      <AuthGate>{children}</AuthGate>
    </SessionProvider>
  );
}
