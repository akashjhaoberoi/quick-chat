import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { displayNameSchema, usernameSchema } from "@/lib/validation";

const body = z.object({ username: usernameSchema, displayName: displayNameSchema });

/** POST /api/users/me/onboarding {username, displayName} → updated profile (onboarded = true). */
export const POST = handler(
  { body, rateLimit: { name: "users.onboarding", limit: 10, window: 60 } },
  async ({ supabase, body }) => {
    return unwrap(await supabase.rpc("complete_onboarding", { p_username: body.username, p_display_name: body.displayName }));
  },
);
