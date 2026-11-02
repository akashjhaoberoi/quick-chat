import { handler, unwrap } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { uuid } from "@/lib/validation";
import { announcementBody } from "../_schema";

/** PUT /api/admin/announcements/{id} — update an announcement (admin+, rpc admin_save_announcement). */
export const PUT = handler(
  { auth: { admin: "admin" }, body: announcementBody, rateLimit: { name: "admin.announce", limit: 30, window: 60 } },
  async ({ supabase, params, body }) => {
    const id = uuid.parse(params.id);
    const { data: existing } = await supabase.from("announcements").select("id").eq("id", id).maybeSingle();
    if (!existing) throw new ApiError(404, "announcement_not_found", "Announcement not found.");
    unwrap(
      await supabase.rpc("admin_save_announcement", {
        p_id: id,
        p_title: body.title,
        p_body: body.body,
        p_level: body.level,
        p_active: body.active,
        p_ends_at: body.endsAt ?? null,
      }),
    );
    return { id };
  },
);

/** DELETE /api/admin/announcements/{id} — delete an announcement (admin+, rpc admin_delete_announcement). */
export const DELETE = handler(
  { auth: { admin: "admin" }, rateLimit: { name: "admin.announce", limit: 30, window: 60 } },
  async ({ supabase, params }) => {
    const id = uuid.parse(params.id);
    unwrap(await supabase.rpc("admin_delete_announcement", { p_id: id }));
    return { id };
  },
);
