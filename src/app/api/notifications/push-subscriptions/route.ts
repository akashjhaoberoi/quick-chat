import { z } from "zod";
import { handler, requireIntegration, unwrap } from "@/lib/api/handler";
import { getSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin";

const MAX_DEVICES = 20;
const token = z.string().trim().min(20).max(4096);

/**
 * POST /api/notifications/push-subscriptions {token, userAgent?}
 * Users have no INSERT grant on push_subscriptions, so the (already
 * authenticated) server upserts with the service role. A token that belonged
 * to another account on this device is reassigned to the current user, so a
 * shared browser never receives the previous user's notifications.
 */
export const POST = handler(
  {
    body: z.object({ token, userAgent: z.string().max(512).optional() }),
    rateLimit: { name: "push.subscribe", limit: 20, window: 600 },
  },
  async ({ user, body, userAgent }) => {
    requireIntegration(hasServiceRole(), "Push notifications (service role key)");
    const admin = getSupabaseAdmin();
    unwrap(
      await admin.from("push_subscriptions").upsert(
        {
          token: body.token,
          user_id: user.id,
          platform: "web",
          user_agent: (body.userAgent ?? userAgent).slice(0, 512) || null,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "token" },
      ),
    );
    // Keep the newest few devices per user; stale tokens are also pruned when FCM rejects them.
    const rows = (unwrap(
      await admin
        .from("push_subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .order("last_used_at", { ascending: false })
        .range(MAX_DEVICES, MAX_DEVICES + 100),
    ) ?? []) as { id: string }[];
    if (rows.length) await admin.from("push_subscriptions").delete().in("id", rows.map((r) => r.id));
    return { subscribed: true };
  },
);

/** DELETE /api/notifications/push-subscriptions {token} — unregister this device. */
export const DELETE = handler(
  { body: z.object({ token }), rateLimit: { name: "push.subscribe", limit: 20, window: 600 } },
  async ({ user, body }) => {
    requireIntegration(hasServiceRole(), "Push notifications (service role key)");
    unwrap(await getSupabaseAdmin().from("push_subscriptions").delete().eq("token", body.token).eq("user_id", user.id));
    return { subscribed: false };
  },
);
