import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { APP_THEME_IDS, type AppThemeId } from "@/lib/app-themes";

/** GET /api/premium/app-theme — my effective app theme (premium themes fall back to classic when Premium lapses). */
export const GET = handler({ rateLimit: { name: "premium.app-theme.read", limit: 60, window: 60 } }, async ({ supabase }) => {
  const theme = unwrap(await supabase.rpc("my_app_theme")) as AppThemeId | null;
  return { theme: theme ?? "classic" };
});

/** POST /api/premium/app-theme { theme } — save my app theme; set_app_theme() checks the Premium entitlement. */
export const POST = handler(
  { body: z.object({ theme: z.enum(APP_THEME_IDS) }), rateLimit: { name: "premium.app-theme", limit: 30, window: 60 } },
  async ({ supabase, body }) => {
    const theme = unwrap(await supabase.rpc("set_app_theme", { p_theme: body.theme })) as AppThemeId;
    return { theme };
  },
);
