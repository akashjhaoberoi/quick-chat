import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";
import type { ProfileViewStats, ProfileVisitor } from "@/types/models";

/** Crawlers, link previewers and headless browsers don't count as visits. */
const BOT_UA = /bot|crawl|spider|slurp|preview|headless|facebookexternalhit|embedly|whatsapp|telegram|discord|curl|wget|python|node-fetch|axios/i;

/**
 * POST /api/profile-views { profileId } — records a visit to someone's profile.
 * The database drops own visits, repeats within 24 h, blocked pairs and
 * profiles that turned tracking off.
 */
export const POST = handler(
  { body: z.object({ profileId: uuid }), rateLimit: { name: "profileViews.record", limit: 60, window: 60 } },
  async ({ supabase, body, req }) => {
    const ua = req.headers.get("user-agent") ?? "";
    if (!ua || BOT_UA.test(ua)) return { recorded: false };
    const recorded = unwrap(await supabase.rpc("record_profile_view", { p_profile_id: body.profileId })) as boolean;
    return { recorded };
  },
);

/** GET /api/profile-views?before= — my visitors (anonymous ones without identity) and totals. */
export const GET = handler(
  { query: z.object({ before: z.string().datetime({ offset: true }).optional() }), rateLimit: { name: "profileViews.read", limit: 60, window: 60 } },
  async ({ supabase, query }) => {
    const [views, stats] = await Promise.all([
      supabase.rpc("my_profile_views", { p_limit: 50, p_before: query.before ?? null }),
      supabase.rpc("my_profile_view_stats"),
    ]);
    const s = ((unwrap(stats) as ProfileViewStats[] | null) ?? [])[0];
    return {
      views: (unwrap(views) as ProfileVisitor[] | null) ?? [],
      stats: {
        unique_visitors: Number(s?.unique_visitors ?? 0),
        unique_visitors_7d: Number(s?.unique_visitors_7d ?? 0),
        total_views: Number(s?.total_views ?? 0),
      },
    };
  },
);
