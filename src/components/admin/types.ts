/** Shapes returned by /api/admin/* (see src/app/api/admin). */
import type { ProfileStatus, ReportReason, ReportTarget } from "@/types/models";

export type AdminRole = "moderator" | "admin" | "super_admin";

export const ROLE_RANK: Record<AdminRole, number> = { moderator: 1, admin: 2, super_admin: 3 };
export const ROLE_LABEL: Record<AdminRole, string> = { moderator: "Moderator", admin: "Admin", super_admin: "Super admin" };

export function hasRole(role: AdminRole | null | undefined, min: AdminRole): boolean {
  return Boolean(role && ROLE_RANK[role] >= ROLE_RANK[min]);
}

export type AdminMe = {
  userId: string;
  role: AdminRole;
  aal: string | null;
  mfaEnforced: boolean;
  serviceRole: boolean;
};

export type Page<T> = { items: T[]; offset: number; limit: number; total: number | null; hasMore: boolean };

export type MiniProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_media_id: string | null;
  status?: ProfileStatus;
};

export type DayCount = { day: string; count: number };

export type AdminStats = {
  total_users: number;
  active_users: number;
  suspended_users: number;
  new_users_7d: number;
  new_users_today: number;
  dau: number;
  mau: number;
  total_messages: number;
  messages_24h: number;
  active_stories: number;
  total_stories: number;
  total_snaps: number;
  total_posts: number;
  storage_bytes: number;
  storage_objects: number;
  pending_deletes: number;
  reports_pending: number;
  appeals_pending: number;
  active_calls: number;
  errors_24h: number;
  last_maintenance: { status: string; finished_at: string | null; details: Record<string, unknown> } | null;
  signups_by_day: DayCount[];
  messages_by_day: DayCount[];
};

export type Health = {
  status: "ok" | "degraded";
  database: "ok" | "unreachable" | "not_configured";
  latencyMs: number | null;
  integrations: {
    supabase: boolean;
    serviceRole: boolean;
    storage: "r2" | "supabase" | null;
    livekit: boolean;
    push: boolean;
    email: boolean;
    redis: boolean;
    cron: boolean;
  };
  time: string;
};

export type AdminUserRow = {
  id: string;
  username: string;
  display_name: string;
  avatar_media_id: string | null;
  status: ProfileStatus;
  suspended_until: string | null;
  created_at: string;
  last_seen_at: string | null;
  role: AdminRole | null;
  report_count: number;
};

export type ModerationActionType = "dismiss" | "warn" | "remove_content" | "suspend" | "ban" | "restore" | "restore_content";

export type ModerationAction = {
  id: string;
  report_id: string | null;
  moderator_id: string | null;
  action: ModerationActionType;
  target_type: string;
  target_id: string;
  target_user_id: string | null;
  reason: string;
  expires_at: string | null;
  created_at: string;
  moderator?: MiniProfile | null;
};

export type ReportStatus = "pending" | "reviewing" | "actioned" | "dismissed";

export type ReportSnapshot = {
  media_ids?: (string | null)[];
  // message
  conversation_id?: string;
  sender_id?: string;
  type?: string;
  body?: string | null;
  metadata?: Record<string, unknown>;
  sent_at?: string;
  // story / post / comment
  user_id?: string;
  author_id?: string;
  post_id?: string;
  caption?: string;
  media_kind?: string;
  posted_at?: string;
  // user / group
  username?: string;
  display_name?: string;
  bio?: string;
  name?: string;
  description?: string;
  created_by?: string;
  [key: string]: unknown;
};

export type ReportRow = {
  id: string;
  reporter_id: string | null;
  target_type: ReportTarget;
  target_id: string;
  target_user_id: string | null;
  reason: ReportReason;
  details: string;
  snapshot: ReportSnapshot;
  status: ReportStatus;
  assigned_to: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  reporter: MiniProfile | null;
  target_user: MiniProfile | null;
};

export type ReportDetail = {
  report: ReportRow & { assignee: MiniProfile | null; resolver: MiniProfile | null };
  actions: ModerationAction[];
  related: Pick<ReportRow, "id" | "reason" | "status" | "details" | "created_at" | "reporter">[];
  /** Current state of the reported content where it can be determined without reading private data. */
  contentState: { status: "active" | "removed" | "deleted" | "expired" | "unknown"; label: string } | null;
  ownerHistory: { warn: number; suspend: number; ban: number; remove_content: number };
};

export type UserSession = {
  id: string;
  session_id: string | null;
  event: string;
  ip: string | null;
  user_agent: string | null;
  device: string | null;
  created_at: string;
};

export type UserDetail = {
  user: AdminUserRow & { bio: string; is_private: boolean; is_verified: boolean; is_creator: boolean; cover_media_id: string | null };
  actions: ModerationAction[];
  reports: Pick<ReportRow, "id" | "target_type" | "reason" | "status" | "created_at" | "reporter">[];
};

export type AppealRow = {
  id: string;
  user_id: string;
  moderation_action_id: string;
  message: string;
  status: "pending" | "accepted" | "rejected";
  reviewed_by: string | null;
  reviewed_at: string | null;
  response: string | null;
  created_at: string;
  user: MiniProfile | null;
  reviewer: MiniProfile | null;
  action: ModerationAction | null;
};

export type ContentPost = {
  id: string;
  media_id: string | null;
  media_kind: "image" | "video";
  caption: string;
  visibility: string;
  status: "active" | "removed" | "deleted";
  like_count: number;
  comment_count: number;
  view_count: number;
  created_at: string;
  author: MiniProfile | null;
};

export type ContentStory = {
  id: string;
  media_id: string | null;
  media_kind: "image" | "video";
  caption: string;
  audience: string;
  view_count: number;
  created_at: string;
  expires_at: string;
  removed_at: string | null;
  author: MiniProfile | null;
};

export type AuditLog = {
  id: number;
  admin_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  created_at: string;
  admin: MiniProfile | null;
};

export type AuditLogPage = Page<AuditLog> & { admins: (MiniProfile & { role: AdminRole })[] };

export type JobRun = {
  id: number;
  job: string;
  status: "running" | "succeeded" | "failed";
  details: Record<string, unknown>;
  started_at: string;
  finished_at: string | null;
};

export type AppErrorRow = {
  id: number;
  source: string;
  message: string;
  context: Record<string, unknown>;
  user_id: string | null;
  created_at: string;
};

export type AppSettings = {
  maintenance_mode: { enabled: boolean; message: string };
  registration_open: boolean;
  limits: { max_upload_mb_image: number; max_upload_mb_video: number; daily_upload_mb: number };
  content_policy: { version: number; url: string };
  updated: Record<string, { updated_at: string; updated_by: MiniProfile | null }>;
};

export type Announcement = {
  id: string;
  title: string;
  body: string;
  level: "info" | "warning" | "critical";
  active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
  author: MiniProfile | null;
};

export type StatusChangeResult = { actionId: string; authSync: "applied" | "skipped" | "failed" };

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "hate", label: "Hate speech" },
  { value: "nudity", label: "Nudity / sexual content" },
  { value: "violence", label: "Violence" },
  { value: "self_harm", label: "Self-harm" },
  { value: "scam", label: "Scam / fraud" },
  { value: "impersonation", label: "Impersonation" },
  { value: "underage", label: "Underage user" },
  { value: "other", label: "Other" },
];

export const REPORT_TARGETS: { value: ReportTarget; label: string }[] = [
  { value: "user", label: "User" },
  { value: "message", label: "Message" },
  { value: "story", label: "Story" },
  { value: "post", label: "Post" },
  { value: "comment", label: "Comment" },
  { value: "group", label: "Group" },
];

export function reasonLabel(reason: string): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

export const ACTION_LABEL: Record<ModerationActionType, string> = {
  dismiss: "Dismissed report",
  warn: "Warning",
  remove_content: "Content removed",
  suspend: "Suspension",
  ban: "Ban",
  restore: "Account restored",
  restore_content: "Content restored",
};
