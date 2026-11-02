import { after } from "next/server";
import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { dispatchRecentPush } from "@/lib/push";
import { uuid } from "@/lib/validation";

/**
 * POST /api/stories/:id/reply { body } — replies privately to a story in the
 * direct chat with its author (message type "story_reply").
 */
export const POST = handler(
  {
    body: z.object({ body: z.string().trim().min(1, "Write a reply").max(1000) }),
    rateLimit: { name: "stories.reply", limit: 30, window: 60 },
  },
  async ({ supabase, params, body, user }) => {
    const storyId = uuid.parse(params.id);
    // RLS only returns stories I'm allowed to view.
    const story = unwrap(await supabase.from("stories").select("user_id").eq("id", storyId).maybeSingle()) as { user_id: string } | null;
    if (!story) throw new ApiError(404, "story_not_found", "This story is no longer available.");
    if (story.user_id === user.id) throw new ApiError(400, "cannot_reply_own_story", "You can't reply to your own story.");

    const conversationId = unwrap(await supabase.rpc("get_or_create_direct_conversation", { p_other: story.user_id })) as string;
    const message = unwrap(
      await supabase.rpc("send_message", {
        p_conversation_id: conversationId,
        p_type: "story_reply",
        p_body: body.body,
        p_metadata: { story_id: storyId },
      }),
    ) as { id: string } | null;
    after(() => dispatchRecentPush());
    return { conversationId, messageId: message?.id ?? null };
  },
);
