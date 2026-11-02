import type { Call, CallKind, UserCard } from "@/types/models";

/** Status of one person in a call (public.call_participants.status). */
export type ParticipantStatus = "ringing" | "joined" | "declined" | "left" | "missed";

export type CallParticipantInfo = {
  user_id: string;
  status: ParticipantStatus;
  invited_at: string;
  joined_at: string | null;
  left_at: string | null;
  profile: UserCard | null;
};

/** GET /api/calls/{id} */
export type CallDetails = {
  call: Call;
  participants: CallParticipantInfo[];
  conversation: {
    id: string;
    type: "direct" | "group";
    title: string;
    avatar_media_id: string | null;
  };
};

/** POST /api/calls/{id}/join */
export type JoinCallResponse = { token: string; url: string; call: Call };

export type StartCallBody = { conversationId: string; kind: CallKind };

export const LIVE_CALL_STATUSES = new Set(["ringing", "active"]);

export function isLiveCall(status: string | null | undefined): boolean {
  return Boolean(status && LIVE_CALL_STATUSES.has(status));
}
