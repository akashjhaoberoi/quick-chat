import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";
import type { Message } from "@/types/models";
import { hydrateMessages, MESSAGE_COLUMNS } from "../../../messages/_lib/hydrate";

/** GET /api/conversations/{id}/media — recent messages with attachments (shared media grid). */
export const GET = handler(
  { query: z.object({ limit: z.coerce.number().int().min(1).max(60).default(30) }) },
  async ({ supabase, user, params, query }) => {
    const rows = unwrap(
      await supabase
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("conversation_id", uuid.parse(params.id))
        .in("type", ["image", "video", "gif", "document", "voice"])
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(query.limit),
    ) as unknown as Message[];
    return hydrateMessages(supabase, user.id, rows);
  },
);
