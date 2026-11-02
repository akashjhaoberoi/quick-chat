import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { offsetParam, page, PAGE_SIZE } from "../_lib/shared";

const query = z.object({
  q: z.string().trim().max(100).optional().default(""),
  status: z.enum(["active", "deactivated", "suspended", "banned"]).optional().catch(undefined),
  offset: offsetParam,
});

/** GET /api/admin/users?q=&status=&offset= — paginated user search (rpc admin_search_users). */
export const GET = handler({ auth: { admin: "moderator" }, query }, async ({ supabase, query }) => {
  const rows = unwrap(
    await supabase.rpc("admin_search_users", {
      p_query: query.q,
      p_status: query.status ?? null,
      p_limit: PAGE_SIZE + 1,
      p_offset: query.offset,
    }),
  ) as unknown[];
  return page(rows ?? [], query.offset, PAGE_SIZE, null);
});
