import { after } from "next/server";
import { z } from "zod";
import { handler, requireIntegration, unwrap } from "@/lib/api/handler";
import { livekitConfigured } from "@/lib/livekit";
import { dispatchRecentPush } from "@/lib/push";
import { uuid } from "@/lib/validation";
import type { Call, CallHistoryItem } from "@/types/models";

const cursor = z
  .string()
  .max(64)
  .refine((v) => !Number.isNaN(Date.parse(v)), "Invalid cursor");

/** Call history for the signed-in user (newest first, cursor = created_at of the last item). */
export const GET = handler(
  {
    query: z.object({
      before: cursor.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(30),
    }),
  },
  async ({ supabase, query }) => {
    const items = (unwrap(await supabase.rpc("my_calls", { p_limit: query.limit, p_before: query.before ?? null })) ?? []) as CallHistoryItem[];
    return {
      items,
      nextCursor: items.length === query.limit ? items[items.length - 1].created_at : null,
    };
  },
);

/** Starts a call in a conversation (or returns the call already live there). */
export const POST = handler(
  {
    body: z.object({ conversationId: uuid, kind: z.enum(["audio", "video"]) }),
    rateLimit: { name: "calls.start", limit: 10, window: 60 },
  },
  async ({ supabase, body }) => {
    requireIntegration(livekitConfigured(), "Audio & video calling");
    const call = unwrap(await supabase.rpc("start_call", { p_conversation_id: body.conversationId, p_kind: body.kind })) as Call;
    // Callees get a high-urgency push (incoming_call notifications).
    after(() => dispatchRecentPush());
    return call;
  },
);
