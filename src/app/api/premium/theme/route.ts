import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { PROFILE_THEMES } from "@/lib/premium-plans";

/** POST /api/premium/theme { theme } — premium profile theme (checked by set_profile_theme). */
export const POST = handler(
  { body: z.object({ theme: z.enum(PROFILE_THEMES) }), rateLimit: { name: "premium.theme", limit: 20, window: 60 } },
  async ({ supabase, body }) => {
    unwrap(await supabase.rpc("set_profile_theme", { p_theme: body.theme }));
    return { theme: body.theme };
  },
);
