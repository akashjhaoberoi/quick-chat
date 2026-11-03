import { handler, unwrap } from "@/lib/api/handler";

/** GET /api/premium/analytics — daily profile views, last 30 days (premium; enforced in my_profile_view_daily). */
export const GET = handler({ rateLimit: { name: "premium.analytics", limit: 30, window: 60 } }, async ({ supabase }) => {
  const rows = (unwrap(await supabase.rpc("my_profile_view_daily")) ?? []) as { day: string; views: number; unique_visitors: number }[];
  return { days: rows.map((r) => ({ day: r.day, views: Number(r.views), uniqueVisitors: Number(r.unique_visitors) })) };
});
