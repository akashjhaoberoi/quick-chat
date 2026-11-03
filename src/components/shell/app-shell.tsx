"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, LogOut, Megaphone, MessageCircle, Phone, Search, Shield, WifiOff, type LucideIcon } from "lucide-react";
import { LogoMark, Wordmark } from "@/components/brand/logo";
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
import {
  ADMIN_NAV, DESKTOP_FULL_HEIGHT_PATTERNS, IMMERSIVE_PREFIXES, isActive, MOBILE_MENU_NAV, MOBILE_NAV, NO_BOTTOM_NAV_PATTERNS, PRIMARY_NAV,
  type NavItem,
} from "./nav-items";

/** Count bubble: accent orange with dark ink (white on orange fails contrast). */
function BadgeDot({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-accent px-1 text-center text-[10px] font-bold leading-[18px] text-brand-ink ring-2 ring-surface">
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
      title={item.label}
      className={cn(
        "group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-semibold transition-colors",
        active ? "bg-brand-soft font-bold text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-full bg-brand" /> : null}
      <span className="relative">
        <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} aria-hidden />
        <BadgeDot count={badge} />
      </span>
      {/* Visible from xl; screen-reader only below so the icon rail keeps a name. */}
      <span className="sr-only xl:not-sr-only">{item.label}</span>
    </Link>
  );
}

/** Desktop (md+) navigation rail: every destination, plus sign out. */
function Sidebar() {
  const pathname = usePathname();
  const { me, signOut } = useSession();
  const badges = useNavBadges(me!.user.id);
  const items = me?.adminRole ? [...PRIMARY_NAV, ADMIN_NAV] : PRIMARY_NAV;
  return (
    <aside className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col border-r border-border bg-surface px-3 py-4 md:flex xl:w-64">
      <Link href="/home" className="mb-4 flex h-10 items-center gap-2.5 rounded-xl px-1.5" aria-label="Quick Chat home">
        <LogoMark className="h-9 w-9 shrink-0" title="" />
        <span className="hidden font-display text-[11px] font-bold uppercase tracking-[0.22em] text-muted xl:inline">Navigate</span>
      </Link>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto no-scrollbar" aria-label="Main">
        {items.map((item) => (
          <SidebarLink key={item.href} item={item} pathname={pathname} badge={item.badge ? badges[item.badge] : 0} />
        ))}
      </nav>
      <div className="mt-3 flex flex-col items-center gap-2 rounded-2xl p-1.5 xl:flex-row xl:gap-3 xl:bg-surface-2 xl:p-2">
        <Avatar mediaId={me?.profile.avatar_media_id} name={displayName(me?.profile)} size="sm" />
        <div className="hidden min-w-0 flex-1 xl:block">
          <p className="truncate text-sm font-bold">{displayName(me?.profile)}</p>
          <p className="truncate text-xs text-muted">@{me?.profile.username}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-ink"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}

/** Round header target: 40px on the narrowest phones, 44px from `sm` up. */
const HEADER_ICON =
  "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink sm:h-11 sm:w-11";

function HeaderIconLink({ href, label, icon: Icon, badge = 0, pathname }: {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  pathname: string;
}) {
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      aria-label={badge ? `${label}, ${badge} unread` : label}
      aria-current={active ? "page" : undefined}
      className={cn(HEADER_ICON, active && "bg-brand-soft text-brand hover:bg-brand-soft hover:text-brand")}
    >
      <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} aria-hidden />
      <span className="absolute right-1 top-1">
        <BadgeDot count={badge} />
      </span>
    </Link>
  );
}

/**
 * App header on every screen size: [Chats, Calls] · QUICK CHAT · [Search, Notifications, Avatar].
 * A 3-column grid with equal 1fr side tracks keeps the wordmark centred no
 * matter how wide the left and right clusters are.
 */
function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { me, signOut } = useSession();
  const badges = useNavBadges(me!.user.id);
  if (IMMERSIVE_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  // Conversations draw their own header on mobile; full-height desktop views (chats, discover) skip it on md+.
  const hideMobile = NO_BOTTOM_NAV_PATTERNS.some((r) => r.test(pathname));
  const hideDesktop = DESKTOP_FULL_HEIGHT_PATTERNS.some((r) => r.test(pathname));
  if (hideMobile && hideDesktop) return null;
  const name = displayName(me?.profile);

  return (
    <header
      className={cn(
        "sticky top-0 z-30 grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 border-b border-border bg-surface/90 px-2 backdrop-blur-xl sm:px-3 md:h-16 md:px-6",
        hideMobile && "max-md:hidden",
        hideDesktop && "md:hidden",
      )}
    >
      <div className="flex items-center justify-self-start">
        <HeaderIconLink href="/chats" label="Chats" icon={MessageCircle} badge={badges.chats} pathname={pathname} />
        <HeaderIconLink href="/calls" label="Calls" icon={Phone} pathname={pathname} />
      </div>

      <Link href="/home" aria-label="Quick Chat home" className="flex items-center gap-2 justify-self-center rounded-xl px-1 py-1">
        <LogoMark className="hidden h-8 w-8 shrink-0 sm:block md:h-9 md:w-9" title="" />
        <Wordmark className="text-[clamp(0.875rem,3.9vw,1.125rem)] sm:text-lg md:text-xl" />
      </Link>

      <div className="flex items-center justify-self-end">
        <HeaderIconLink href="/search" label="Search" icon={Search} pathname={pathname} />
        <HeaderIconLink href="/notifications" label="Notifications" icon={Bell} badge={badges.notifications} pathname={pathname} />
        {/* Mobile: the avatar opens the account menu, which also reaches Home, Discover, Snaps, Friends and Settings. */}
        <div className="flex md:hidden">
          <Menu
            label="Account menu"
            trigger={
              <span className={HEADER_ICON}>
                <Avatar mediaId={me?.profile.avatar_media_id} name={name} size="sm" className="rounded-full ring-2 ring-brand-soft" />
                <span className="absolute right-0.5 top-0.5">
                  <BadgeDot count={badges.requests + badges.snaps} />
                </span>
              </span>
            }
            items={[
              ...MOBILE_MENU_NAV.map((item) => {
                const Icon = item.icon;
                const count = item.badge ? badges[item.badge] : 0;
                return { label: count ? `${item.label} (${count})` : item.label, icon: <Icon />, onSelect: () => router.push(item.href) };
              }),
              ...(me?.adminRole ? [{ label: "Admin", icon: <Shield />, onSelect: () => router.push("/admin") }] : []),
              { label: "Sign out", icon: <LogOut />, onSelect: () => void signOut(), danger: true },
            ]}
          />
        </div>
        {/* Desktop: the sidebar carries every other destination, so the avatar links straight to the profile. */}
        <Link
          href="/profile"
          aria-label="Profile"
          aria-current={isActive(pathname, "/profile") ? "page" : undefined}
          className={cn(HEADER_ICON, "hidden md:inline-flex")}
        >
          <Avatar mediaId={me?.profile.avatar_media_id} name={name} size="sm" className="rounded-full ring-2 ring-brand-soft" />
        </Link>
      </div>
    </header>
  );
}

/** Mobile bottom bar: Chats, Camera, Stories, Calls, Profile (each target ≥48px). */
function BottomNav() {
  const pathname = usePathname();
  const { me } = useSession();
  const badges = useNavBadges(me!.user.id);
  if (IMMERSIVE_PREFIXES.some((p) => pathname.startsWith(p)) || NO_BOTTOM_NAV_PATTERNS.some((r) => r.test(pathname))) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur-xl safe-bottom md:hidden" aria-label="Main">
      <ul className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-1">
        {MOBILE_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          const isCamera = item.href === "/camera";
          const badge = item.badge ? badges[item.badge] : 0;
          return (
            <li key={item.href} className="flex justify-center">
              <Link
                href={item.href}
                aria-label={badge ? `${item.label}, ${badge} unread` : item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-12 min-w-14 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 text-[11px] font-bold transition-colors",
                  active ? "text-brand" : "text-muted hover:text-ink",
                )}
              >
                {isCamera ? (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-brand-ink shadow-[var(--shadow-soft)] ring-4 ring-brand-soft">
                    <Icon className="h-6 w-6" strokeWidth={2.2} aria-hidden />
                  </span>
                ) : (
                  <>
                    <span className={cn("relative flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-brand-soft")}>
                      <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 2} aria-hidden />
                      <span className="absolute right-1.5 top-0">
                        <BadgeDot count={badge} />
                      </span>
                    </span>
                    <span aria-hidden>{item.label}</span>
                  </>
                )}
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
        <Suspense fallback={<div className="h-14 md:h-16" />}>
          <AppHeader />
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
