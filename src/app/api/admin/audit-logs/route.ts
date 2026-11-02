import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";
import { likePattern, offsetParam, page, PAGE_SIZE, PROFILE } from "../_lib/shared";

const query = z.object({
  action: z.string().trim().max(60).optional().default(""),
  adminId: uuid.optional().catch(undefined),
  target: z.string().trim().max(80).optional().default(""),
  offset: offsetParam,
});

/** GET /api/admin/audit-logs?action=&adminId=&target=&offset= — the admin audit trail (admin+). */
export const GET = handler({ auth: { admin: "admin" }, query }, async ({ supabase, query }) => {
  let q = supabase
    .from("admin_audit_logs")
    .select(`*, admin:profiles!admin_audit_logs_admin_id_fkey(${PROFILE})`, { count: "exact" });
  if (query.action) q = q.ilike("action", `${likePattern(query.action)}%`);
  if (query.adminId) q = q.eq("admin_id", query.adminId);
  if (query.target) q = q.eq("target_id", query.target);
  const [logs, admins] = await Promise.all([
    q.order("created_at", { ascending: false }).range(query.offset, query.offset + PAGE_SIZE - 1),
    supabase.from("admin_roles").select(`role, profile:profiles!admin_roles_user_id_fkey(${PROFILE})`),
  ]);
  const items = unwrap({ data: logs.data, error: logs.error }) ?? [];
  const adminRows = (unwrap(admins) ?? []) as unknown as { role: string; profile: Record<string, unknown> | null }[];
  return {
    ...page(items, query.offset, PAGE_SIZE, logs.count ?? null),
    admins: adminRows.filter((a) => a.profile).map((a) => ({ ...a.profile, role: a.role })),
  };
});
