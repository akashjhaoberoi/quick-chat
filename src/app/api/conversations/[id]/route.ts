import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { uuid } from "@/lib/validation";
import type { ConversationMember, Group, UserCard } from "@/types/models";
import type { ConversationDetail } from "@/components/chat/types";

/** GET /api/conversations/{id} — conversation, group, members with profiles and my state. */
export const GET = handler({}, async ({ supabase, user, params }) => {
  const id = uuid.parse(params.id);
  const [conv, group, members, state] = await Promise.all([
    supabase.from("conversations").select("id, type, disappear_mode, created_by, created_at").eq("id", id).maybeSingle(),
    supabase.from("groups").select("*").eq("conversation_id", id).maybeSingle(),
    supabase.from("conversation_members").select("*").eq("conversation_id", id).limit(500),
    supabase
      .from("conversation_member_state")
      .select("muted_until, archived_at, last_read_at")
      .eq("conversation_id", id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const conversation = unwrap(conv) as ConversationDetail["conversation"] | null;
  if (!conversation) throw new ApiError(404, "conversation_not_found", "Conversation not found.");
  const rows = unwrap(members) as ConversationMember[];
  const self = rows.find((m) => m.user_id === user.id && !m.left_at);
  if (!self) throw new ApiError(404, "conversation_not_found", "Conversation not found.");

  const profiles = unwrap(
    await supabase.from("profiles").select("id, username, display_name, avatar_media_id").in("id", rows.map((m) => m.user_id)).limit(500),
  ) as UserCard[];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const st = unwrap(state) as { muted_until: string | null; archived_at: string | null; last_read_at: string | null } | null;

  const otherMember = conversation.type === "direct" ? rows.find((m) => m.user_id !== user.id) : undefined;
  let blocked = false;
  if (otherMember) {
    const { data } = await supabase
      .from("blocks")
      .select("blocked_id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", otherMember.user_id)
      .maybeSingle();
    blocked = Boolean(data);
  }

  const detail: ConversationDetail = {
    conversation,
    group: unwrap(group) as Group | null,
    members: rows.map((m) => ({ ...m, profile: byId.get(m.user_id) ?? null })),
    me: { role: self.role, muted_until: st?.muted_until ?? null, archived: Boolean(st?.archived_at), last_read_at: st?.last_read_at ?? null },
    other: otherMember ? byId.get(otherMember.user_id) ?? null : null,
    blocked,
  };
  return detail;
});

const patchBody = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    description: z.string().max(300).optional(),
    avatarMediaId: uuid.optional(),
    onlyAdminsSend: z.boolean().optional(),
    onlyAdminsEdit: z.boolean().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), "Nothing to update");

/** PATCH /api/conversations/{id} — update group details/settings. */
export const PATCH = handler(
  { body: patchBody, rateLimit: { name: "groups.update", limit: 30, window: 60 } },
  async ({ supabase, params, body }) => {
    unwrap(
      await supabase.rpc("update_group", {
        p_conversation_id: uuid.parse(params.id),
        p_name: body.name ?? null,
        p_description: body.description ?? null,
        p_avatar_media_id: body.avatarMediaId ?? null,
        p_only_admins_send: body.onlyAdminsSend ?? null,
        p_only_admins_edit: body.onlyAdminsEdit ?? null,
      }),
    );
    return { ok: true };
  },
);

/** DELETE /api/conversations/{id} — delete (clear) the conversation history for me. */
export const DELETE = handler({ rateLimit: { name: "conversations.clear", limit: 30, window: 60 } }, async ({ supabase, params }) => {
  unwrap(await supabase.rpc("clear_conversation", { p_conversation_id: uuid.parse(params.id) }));
  return { ok: true };
});
