import {
  Bell, Camera, Compass, Crown, Home, MessageCircle, Phone, Settings, Shield, Sparkles, User, Users, Zap,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: "chats" | "notifications" | "snaps" | "requests" };

/** Desktop sidebar: every destination in the app. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/chats", label: "Chats", icon: MessageCircle, badge: "chats" },
  { href: "/snaps", label: "Snaps", icon: Zap, badge: "snaps" },
  { href: "/stories", label: "Stories", icon: Sparkles },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/friends", label: "Friends", icon: Users, badge: "requests" },
  { href: "/notifications", label: "Notifications", icon: Bell, badge: "notifications" },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/premium", label: "Premium", icon: Crown },
  { href: "/settings", label: "Settings", icon: Settings },
];

export const ADMIN_NAV: NavItem = { href: "/admin", label: "Admin", icon: Shield };

/** Mobile bottom bar, in the product owner's order (Camera is drawn as a filled action). */
export const MOBILE_NAV: NavItem[] = [
  { href: "/chats", label: "Chats", icon: MessageCircle, badge: "chats" },
  { href: "/camera", label: "Camera", icon: Camera },
  { href: "/stories", label: "Stories", icon: Sparkles },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/profile", label: "Profile", icon: User },
];

/** Mobile account menu (header avatar): destinations not in the bottom bar or header. */
export const MOBILE_MENU_NAV: NavItem[] = [
  { href: "/profile", label: "Profile", icon: User },
  { href: "/home", label: "Home", icon: Home },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/snaps", label: "Snaps", icon: Zap, badge: "snaps" },
  { href: "/friends", label: "Friends", icon: Users, badge: "requests" },
  { href: "/premium", label: "Premium", icon: Crown },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Routes that take over the whole screen on mobile (no bottom nav / header). */
export const IMMERSIVE_PREFIXES = ["/camera", "/stories/view", "/calls/"];
/** Routes that hide the bottom nav on mobile but keep their own header. */
export const NO_BOTTOM_NAV_PATTERNS = [/^\/chats\/[^/]+/];
/**
 * Routes whose desktop layout fills the viewport (`md:h-dvh`), so the app
 * header is left out on md+ there (the sidebar still provides navigation).
 */
export const DESKTOP_FULL_HEIGHT_PATTERNS = [/^\/chats(\/|$)/, /^\/discover\/?$/, /^\/discover\/tag\//, /^\/discover\/(?!new\/?$)[^/]+\/?$/];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
