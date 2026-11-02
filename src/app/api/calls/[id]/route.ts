import { handler, unwrap } from "@/lib/api/handler";
import { ApiError, messageFor } from "@/lib/api/errors";
import { uuid } from "@/lib/validation";
import { displayName } from "@/lib/utils";
import type { Call, UserCard } from "@/types/models";
import type { CallDetails, CallParticipantInfo } from "@/components/calls/types";

/** A call with its participants (profiles) and conversation title. RLS limits this to participants. */
export const GET = handler({}, async ({ supabase, params, user }): Promise<CallDetails> => {
  const id = uuid.parse(params.id);
  const call = unwrap(await supabase.from("calls").select("*").eq("id", id).maybeSingle()) as Call | null;
  if (!call) throw new ApiError(404, "call_not_found", messageFor("call_not_found"));

  const [participantsRes, conversationRes, groupRes] = await Promise.all([
    supabase
      .from("call_participants")
      .select("user_id, status, invited_at, joined_at, left_at")
      .eq("call_id", id)
      .order("invited_at", { ascending: true }),
    supabase.from("conversations").select("id, type").eq("id", call.conversation_id).maybeSingle(),
    supabase.from("groups").select("name, avatar_media_id").eq("conversation_id", call.conversation_id).maybeSingle(),
  ]);
  const rows = (unwrap(participantsRes) ?? []) as Omit<CallParticipantInfo, "profile">[];
  const ids = rows.map((r) => r.user_id);
  const profiles = ids.length
    ? ((unwrap(await supabase.from("profiles").select("id, username, display_name, avatar_media_id").in("id", ids)) ?? []) as UserCard[])
    : [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const participants: CallParticipantInfo[] = rows.map((r) => ({ ...r, profile: byId.get(r.user_id) ?? null }));

  const conversation = conversationRes.data as { id: string; type: "direct" | "group" } | null;
  const group = groupRes.data as { name: string; avatar_media_id: string | null } | null;
  const other = participants.find((p) => p.user_id !== user.id && p.profile)?.profile ?? null;
  const type = conversation?.type ?? (group ? "group" : "direct");

  return {
    call,
    participants,
    conversation: {
      id: call.conversation_id,
      type,
      title: group?.name ?? (other ? displayName(other) : "Call"),
      avatar_media_id: group ? group.avatar_media_id : (other?.avatar_media_id ?? null),
    },
  };
});
