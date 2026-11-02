import { after } from "next/server";
import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { dispatchRecentPush } from "@/lib/push";
import { uuid } from "@/lib/validation";

/** POST /api/stories/:id/react { emoji | null } — set or clear my reaction. */
export const POST = handler(
  {
    body: z.object({ emoji: z.string().trim().min(1).max(16).nullable() }),
    rateLimit: { name: "stories.react", limit: 60, window: 60 },
  },
  async ({ supabase, params, body }) => {
    const id = uuid.parse(params.id);
    unwrap(await supabase.rpc("react_to_story", { p_story_id: id, p_emoji: body.emoji }));
    if (body.emoji) after(() => dispatchRecentPush());
    return { emoji: body.emoji };
  },
);
