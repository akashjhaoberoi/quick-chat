import { handler } from "@/lib/api/handler";
import { fetchScore } from "@/components/snaps/data";

/** GET /api/score — my total score and recent score events. */
export const GET = handler({ rateLimit: { name: "score.get", limit: 120, window: 60 } }, async ({ supabase, user }) => {
  return fetchScore(supabase, user.id);
});
