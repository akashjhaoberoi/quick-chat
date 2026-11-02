import {
  Bell, Camera, Compass, Home, MessageCircle, Phone, Settings, Shield, Sparkles, User, Users, Zap,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: "chats" | "notifications" | "snaps" | "requests" };

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
  { href: "/settings", label: "Settings", icon: Settings },
];

export const ADMIN_NAV: NavItem = { href: "/admin", label: "Admin", icon: Shield };

export const MOBILE_NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/chats", label: "Chats", icon: MessageCircle, badge: "chats" },
  { href: "/camera", label: "Camera", icon: Camera },
  { href: "/stories", label: "Stories", icon: Sparkles },
  { href: "/discover", label: "Discover", icon: Compass },
];

/** Routes that take over the whole screen on mobile (no bottom nav / header). */
export const IMMERSIVE_PREFIXES = ["/camera", "/stories/view", "/calls/"];
/** Routes that hide the bottom nav on mobile but keep their own header. */
export const NO_BOTTOM_NAV_PATTERNS = [/^\/chats\/[^/]+/];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
