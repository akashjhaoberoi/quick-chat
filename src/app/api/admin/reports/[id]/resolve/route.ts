import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

const body = z
  .object({
    resolution: z.enum(["reviewing", "actioned", "dismissed"]),
    note: z.string().trim().max(1000).optional().default(""),
  })
  .refine((b) => b.resolution !== "dismissed" || b.note.length >= 3, {
    message: "Add a short note explaining why the report is dismissed",
    path: ["note"],
  });

/** POST /api/admin/reports/{id}/resolve — mark reviewing, dismiss or resolve as actioned (rpc admin_resolve_report). */
export const POST = handler(
  { auth: { admin: "moderator" }, body, rateLimit: { name: "admin.resolve", limit: 120, window: 60 } },
  async ({ supabase, params, body }) => {
    const id = uuid.parse(params.id);
    unwrap(await supabase.rpc("admin_resolve_report", { p_report_id: id, p_resolution: body.resolution, p_note: body.note }));
    return { status: body.resolution };
  },
);
