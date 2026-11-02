import { after } from "next/server";
import { handler, unwrap } from "@/lib/api/handler";
import { dispatchRecentPush } from "@/lib/push";
import { uuid } from "@/lib/validation";

/** POST /api/users/{id}/follow — toggles following; returns the new state. */
export const POST = handler(
  { rateLimit: { name: "users.follow", limit: 60, window: 60 } },
  async ({ supabase, params }) => {
    const id = uuid.parse(params.id);
    const following = Boolean(unwrap(await supabase.rpc("toggle_follow", { p_target: id })));
    if (following) after(() => dispatchRecentPush());
    return { following };
  },
);
