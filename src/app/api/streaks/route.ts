import { handler } from "@/lib/api/handler";
import { fetchStreaks } from "@/components/snaps/data";

/** GET /api/streaks — my streaks (rpc my_streaks). */
export const GET = handler({ rateLimit: { name: "streaks.list", limit: 120, window: 60 } }, async ({ supabase }) => {
  return fetchStreaks(supabase);
});
