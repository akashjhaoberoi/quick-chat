/** Row shapes returned by Supabase tables and RPCs (see supabase/migrations). */

export type ProfileStatus = "active" | "deactivated" | "suspended" | "banned";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_media_id: string | null;
  cover_media_id: string | null;
  is_private: boolean;
  is_creator: boolean;
  is_verified: boolean;
  status: ProfileStatus;
  suspended_until: string | null;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
};

export type UserSettings = {
  user_id: string;
  theme: "system" | "light" | "dark";
  who_can_message: "everyone" | "friends";
  who_can_add: "everyone" | "friends_of_friends" | "nobody";
  last_active_visibility: "everyone" | "friends" | "nobody";
  read_receipts: boolean;
  discoverable: boolean;
  show_score: boolean;
  story_default_audience: "public" | "friends";
  location_sharing: boolean;
  notification_prefs: Partial<Record<NotificationType, boolean>>;
  push_enabled: boolean;
  email_security_alerts: boolean;
  updated_at: string;
};

export type ProfileSummary = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_media_id: string | null;
  cover_media_id: string | null;
  is_private: boolean;
  is_creator: boolean;
  is_verified: boolean;
  created_at: string;
  score: number | null;
  friend_count: number | null;
  follower_count: number;
  following_count: number;
  post_count: number | null;
  is_friend: boolean;
  is_following: boolean;
  request_status: "incoming" | "outgoing" | null;
  request_id: string | null;
  mutual_count: number;
  last_seen_at: string | null;
  can_view_details: boolean;
};

export type UserCard = {
  id: string;
  username: string;
  display_name: string;
  avatar_media_id: string | null;
};

export type Friend = UserCard & { friends_since: string; last_seen_at: string | null; streak_count: number };

export type FriendRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  created_at: string;
};

export type ConversationType = "direct" | "group";
export type DisappearMode = "off" | "24h" | "7d";

export type ConversationSummary = {
  conversation_id: string;
  type: ConversationType;
  title: string;
  avatar_media_id: string | null;
  other_user_id: string | null;
  other_username: string | null;
  member_count: number;
  role: "owner" | "admin" | "member";
  disappear_mode: DisappearMode;
  last_message_at: string;
  last_message_id: string | null;
  last_message_type: MessageType | null;
  last_message_body: string | null;
  last_message_sender_id: string | null;
  last_message_deleted: boolean;
  unread_count: number;
  muted_until: string | null;
  archived: boolean;
  streak_count: number | null;
};

export type MessageType =
  | "text" | "image" | "video" | "voice" | "gif" | "sticker" | "document"
  | "location" | "contact" | "link" | "story_reply" | "system" | "call";

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  type: MessageType;
  body: string | null;
  metadata: Record<string, unknown>;
  reply_to_id: string | null;
  forwarded: boolean;
  client_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  expires_at: string | null;
  pinned_at: string | null;
  pinned_by: string | null;
  created_at: string;
};

export type MessageAttachment = { id: string; message_id: string; media_id: string; position: number };
export type MessageReaction = { message_id: string; user_id: string; emoji: string; created_at: string };

export type ConversationMember = {
  conversation_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  left_at: string | null;
  last_read_public_at: string | null;
  last_delivered_at: string | null;
};

export type Group = {
  conversation_id: string;
  name: string;
  description: string;
  avatar_media_id: string | null;
  only_admins_send: boolean;
  only_admins_edit: boolean;
  created_by: string | null;
  created_at: string;
};

export type MediaAsset = {
  id: string;
  kind: "image" | "video" | "audio" | "document";
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  file_name: string | null;
  purpose: string;
  status: string;
};

export type Overlay =
  | { type: "text"; text: string; x: number; y: number; color: string; size: number; rotation?: number; font?: string }
  | { type: "emoji"; emoji: string; x: number; y: number; size: number; rotation?: number };

export type Snap = {
  id: string;
  sender_id: string;
  media_id: string | null;
  media_kind: "image" | "video";
  caption: string;
  overlays: Overlay[];
  duration_seconds: number | null;
  view_once: boolean;
  allow_replay: boolean;
  expires_at: string;
  media_deleted_at: string | null;
  created_at: string;
};

export type SnapRecipient = {
  snap_id: string;
  recipient_id: string;
  status: "delivered" | "opened" | "expired";
  delivered_at: string;
  opened_at: string | null;
  view_expires_at: string | null;
  replay_count: number;
  screenshot_at: string | null;
};

export type StoryAudience = "public" | "friends" | "custom";

export type StoryFeedItem = UserCard & {
  user_id: string;
  story_count: number;
  latest_at: string;
  has_unseen: boolean;
  is_me: boolean;
};

export type Story = {
  id: string;
  media_id: string | null;
  media_kind: "image" | "video";
  caption: string;
  overlays: Overlay[];
  audience: StoryAudience;
  created_at: string;
  expires_at: string;
  viewed: boolean;
  my_reaction: string | null;
  view_count: number | null;
  reaction_count: number | null;
};

export type Streak = {
  friend_id: string;
  username: string;
  display_name: string;
  avatar_media_id: string | null;
  count: number;
  expires_at: string | null;
  i_sent_today: boolean;
  they_sent_today: boolean;
  recoverable: boolean;
  lost_count: number;
};

export type CallKind = "audio" | "video";
export type CallStatus = "ringing" | "active" | "ended" | "missed" | "declined" | "cancelled";

export type Call = {
  id: string;
  conversation_id: string;
  initiator_id: string | null;
  kind: CallKind;
  status: CallStatus;
  room_name: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
};

export type CallHistoryItem = {
  call_id: string;
  conversation_id: string;
  kind: CallKind;
  status: CallStatus;
  my_status: "ringing" | "joined" | "declined" | "left" | "missed";
  initiator_id: string | null;
  is_outgoing: boolean;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  title: string;
  avatar_media_id: string | null;
  other_user_id: string | null;
};

export type NotificationType =
  | "message" | "friend_request" | "friend_accepted" | "incoming_call" | "missed_call" | "snap" | "snap_opened"
  | "snap_screenshot" | "story_reaction" | "story_reply" | "streak_reminder" | "mention" | "group_invite"
  | "security" | "system" | "post_like" | "post_comment" | "follow" | "moderation";

export type AppNotification = {
  id: string;
  user_id: string;
  type: NotificationType;
  actor_id: string | null;
  title: string;
  body: string;
  data: { url?: string; [key: string]: unknown };
  entity_type: string | null;
  entity_id: string | null;
  count: number;
  read_at: string | null;
  created_at: string;
};

export type FeedPost = {
  id: string;
  author_id: string;
  username: string;
  display_name: string;
  avatar_media_id: string | null;
  is_verified: boolean;
  media_id: string;
  media_kind: "image" | "video";
  caption: string;
  hashtags: string[];
  like_count: number;
  comment_count: number;
  view_count: number;
  share_count: number;
  created_at: string;
  liked: boolean;
  saved: boolean;
  following: boolean;
  score: number;
};

export type PostComment = {
  id: string;
  post_id: string;
  user_id: string | null;
  parent_id: string | null;
  body: string;
  status: string;
  created_at: string;
};

export type ReportTarget = "user" | "message" | "story" | "post" | "comment" | "group";
export type ReportReason =
  | "spam" | "harassment" | "hate" | "nudity" | "violence" | "self_harm" | "scam" | "impersonation" | "underage" | "other";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };
