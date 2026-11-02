import {
  AtSign, Bell, Camera, Eye, Flame, Heart, MessageCircle, MessageSquareReply, PhoneIncoming, PhoneMissed, ScanEye, ShieldAlert,
  ShieldCheck, Smile, UserCheck, UserPlus, UserRoundPlus, Users, type LucideIcon,
} from "lucide-react";
import type { AppNotification, NotificationType } from "@/types/models";

type Meta = { icon: LucideIcon; color: string; noun: [string, string] };

/** Icon, colour and pluralisable noun per notification type. */
export const NOTIFICATION_META: Record<NotificationType, Meta> = {
  message: { icon: MessageCircle, color: "#2e90fa", noun: ["new message", "new messages"] },
  friend_request: { icon: UserPlus, color: "#7c5cff", noun: ["friend request", "friend requests"] },
  friend_accepted: { icon: UserCheck, color: "#12b76a", noun: ["accepted request", "accepted requests"] },
  incoming_call: { icon: PhoneIncoming, color: "#12b76a", noun: ["incoming call", "incoming calls"] },
  missed_call: { icon: PhoneMissed, color: "#f04438", noun: ["missed call", "missed calls"] },
  snap: { icon: Camera, color: "#ff5e7e", noun: ["new Snap", "new Snaps"] },
  snap_opened: { icon: Eye, color: "#667085", noun: ["Snap opened", "Snaps opened"] },
  snap_screenshot: { icon: ScanEye, color: "#f79009", noun: ["screenshot", "screenshots"] },
  story_reaction: { icon: Smile, color: "#c065f5", noun: ["story reaction", "story reactions"] },
  story_reply: { icon: MessageSquareReply, color: "#c065f5", noun: ["story reply", "story replies"] },
  streak_reminder: { icon: Flame, color: "#ef6820", noun: ["streak reminder", "streak reminders"] },
  mention: { icon: AtSign, color: "#2e90fa", noun: ["mention", "mentions"] },
  group_invite: { icon: Users, color: "#15b79e", noun: ["group invite", "group invites"] },
  security: { icon: ShieldCheck, color: "#f79009", noun: ["security alert", "security alerts"] },
  system: { icon: Bell, color: "#7c5cff", noun: ["update", "updates"] },
  post_like: { icon: Heart, color: "#ff5e7e", noun: ["new like", "new likes"] },
  post_comment: { icon: MessageCircle, color: "#7c5cff", noun: ["new comment", "new comments"] },
  follow: { icon: UserRoundPlus, color: "#7c5cff", noun: ["new follower", "new followers"] },
  moderation: { icon: ShieldAlert, color: "#f04438", noun: ["moderation notice", "moderation notices"] },
};

export function metaFor(type: string): Meta {
  return NOTIFICATION_META[type as NotificationType] ?? NOTIFICATION_META.system;
}

/** "3 new messages" for aggregated notifications, otherwise null. */
export function countLabel(n: Pick<AppNotification, "type" | "count">): string | null {
  if (!n.count || n.count <= 1) return null;
  const [one, many] = metaFor(n.type).noun;
  return `${n.count} ${n.count === 1 ? one : many}`;
}

/** Only same-origin relative paths are followed. */
export function safeUrl(url: unknown): string | null {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : null;
}
