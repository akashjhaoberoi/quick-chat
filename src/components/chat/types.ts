import type { ConversationMember, ConversationType, DisappearMode, Group, Message, UserCard } from "@/types/models";

/** Media metadata attached to a message (resolved server-side). */
export type AttachmentInfo = {
  media_id: string;
  position: number;
  kind: "image" | "video" | "audio" | "document" | null;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  file_name: string | null;
};

export type ReplyPreview = {
  id: string;
  sender_id: string | null;
  type: Message["type"];
  body: string | null;
  deleted: boolean;
};

export type ChatReaction = { user_id: string; emoji: string };

/** A message as rendered by the chat UI. */
export type ChatMessage = Message & {
  attachments: AttachmentInfo[];
  reactions: ChatReaction[];
  starred: boolean;
  reply_to: ReplyPreview | null;
};

export type MessagePage = { messages: ChatMessage[]; hasMore: boolean };

export type MemberWithProfile = ConversationMember & { profile: UserCard | null };

export type ConversationDetail = {
  conversation: {
    id: string;
    type: ConversationType;
    disappear_mode: DisappearMode;
    created_by: string | null;
    created_at: string;
  };
  group: Group | null;
  members: MemberWithProfile[];
  me: {
    role: "owner" | "admin" | "member";
    muted_until: string | null;
    archived: boolean;
    last_read_at: string | null;
  };
  /** Direct chats: the other participant. */
  other: UserCard | null;
  /** Direct chats: whether I have blocked the other participant. */
  blocked: boolean;
};

export type StarredItem = ChatMessage & { conversation_title: string; conversation_type: ConversationType };

export type SearchHit = { id: string; conversation_id: string; sender_id: string | null; type: Message["type"]; body: string | null; created_at: string };

export type LinkPreview = { url: string; title: string | null; description: string | null; domain: string };

export type DeliveryStatus = "sending" | "failed" | "sent" | "delivered" | "read";
