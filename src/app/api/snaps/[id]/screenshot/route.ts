import { after } from "next/server";
import { handler, unwrap } from "@/lib/api/handler";
import { dispatchRecentPush } from "@/lib/push";
import { uuid } from "@/lib/validation";

/**
 * POST /api/snaps/:id/screenshot — best-effort screenshot report from the
 * viewer (browsers cannot reliably detect screenshots). Notifies the sender once.
 */
export const POST = handler(
  { rateLimit: { name: "snaps.screenshot", limit: 20, window: 60 } },
  async ({ supabase, params }) => {
    const snapId = uuid.parse(params.id);
    unwrap(await supabase.rpc("report_snap_screenshot", { p_snap_id: snapId }));
    after(() => dispatchRecentPush());
    return { reported: true };
  },
);
