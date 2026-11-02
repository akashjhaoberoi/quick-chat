import { handler, unwrap } from "@/lib/api/handler";
import type { ConversationType, Message } from "@/types/models";
import type { StarredItem } from "@/components/chat/types";
import { hydrateMessages, MESSAGE_COLUMNS } from "../_lib/hydrate";

/** GET /api/messages/starred — my starred messages (newest first) with conversation titles. */
export const GET = handler({}, async ({ supabase, user }) => {
  const stars = unwrap(
    await supabase.from("starred_messages").select("message_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
  ) as { message_id: string }[];
  if (stars.length === 0) return [];
  const rows = unwrap(
    await supabase.from("messages").select(MESSAGE_COLUMNS).in("id", stars.map((s) => s.message_id)).is("deleted_at", null),
  ) as unknown as Message[];
  const convs = unwrap(await supabase.rpc("my_conversations", { p_archived: false, p_limit: 100 })) as {
    conversation_id: string;
    title: string;
    type: ConversationType;
  }[];
  const archived = unwrap(await supabase.rpc("my_conversations", { p_archived: true, p_limit: 100 })) as typeof convs;
  const titles = new Map([...convs, ...archived].map((c) => [c.conversation_id, c]));
  const order = new Map(stars.map((s, i) => [s.message_id, i]));
  const hydrated = await hydrateMessages(supabase, user.id, rows);
  return hydrated
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map<StarredItem>((m) => ({
      ...m,
      conversation_title: titles.get(m.conversation_id)?.title ?? "Conversation",
      conversation_type: titles.get(m.conversation_id)?.type ?? "direct",
    }));
});
