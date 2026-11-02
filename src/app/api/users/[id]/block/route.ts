import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** POST /api/users/{id}/block — block (also unfriends, cancels requests, removes follows). */
export const POST = handler(
  { rateLimit: { name: "users.block", limit: 30, window: 60 } },
  async ({ supabase, params }) => {
    const id = uuid.parse(params.id);
    unwrap(await supabase.rpc("block_user", { p_other: id }));
    return { blocked: true };
  },
);

/** DELETE /api/users/{id}/block — unblock. */
export const DELETE = handler(
  { rateLimit: { name: "users.block", limit: 30, window: 60 } },
  async ({ supabase, params }) => {
    const id = uuid.parse(params.id);
    unwrap(await supabase.rpc("unblock_user", { p_other: id }));
    return { blocked: false };
  },
);
