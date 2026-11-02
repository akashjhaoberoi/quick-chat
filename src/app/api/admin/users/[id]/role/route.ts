import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

const body = z.object({ role: z.enum(["moderator", "admin", "super_admin"]).nullable() });

/** POST /api/admin/users/{id}/role — grant or revoke an admin role (super admin only, rpc admin_set_role). */
export const POST = handler(
  { auth: { admin: "super_admin" }, body, rateLimit: { name: "admin.role", limit: 20, window: 60 } },
  async ({ supabase, params, body }) => {
    const id = uuid.parse(params.id);
    unwrap(await supabase.rpc("admin_set_role", { p_user_id: id, p_role: body.role }));
    return { role: body.role };
  },
);
