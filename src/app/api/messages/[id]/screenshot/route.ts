import { after } from "next/server";
import { handler, unwrap } from "@/lib/api/handler";
import { dispatchRecentPush } from "@/lib/push";
import { uuid } from "@/lib/validation";

/**
 * POST /api/messages/:id/screenshot — best-effort screenshot report for
 * protected or view-once media (browsers only see some screenshot shortcuts).
 * Logged as a security event; the sender is notified at most once a minute.
 */
export const POST = handler({ rateLimit: { name: "messages.screenshot", limit: 20, window: 60 } }, async ({ supabase, params }) => {
  const reported = unwrap(await supabase.rpc("report_media_screenshot", { p_message_id: uuid.parse(params.id) })) as boolean;
  if (reported) after(() => dispatchRecentPush());
  return { reported };
});
