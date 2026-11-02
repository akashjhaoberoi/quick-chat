import { handler, unwrap } from "@/lib/api/handler";
import { PROFILE } from "../_lib/shared";
import { announcementBody } from "./_schema";

/** GET /api/admin/announcements — every announcement, newest first (admin+). */
export const GET = handler({ auth: { admin: "admin" } }, async ({ supabase }) => {
  return (
    unwrap(
      await supabase
        .from("announcements")
        .select(`*, author:profiles!announcements_created_by_fkey(${PROFILE})`)
        .order("created_at", { ascending: false })
        .limit(200),
    ) ?? []
  );
});

/** POST /api/admin/announcements — create an announcement (admin+, rpc admin_save_announcement). */
export const POST = handler(
  { auth: { admin: "admin" }, body: announcementBody, rateLimit: { name: "admin.announce", limit: 30, window: 60 } },
  async ({ supabase, body }) => {
    const id = unwrap(
      await supabase.rpc("admin_save_announcement", {
        p_id: null,
        p_title: body.title,
        p_body: body.body,
        p_level: body.level,
        p_active: body.active,
        p_ends_at: body.endsAt ?? null,
      }),
    ) as string;
    return { id };
  },
);
