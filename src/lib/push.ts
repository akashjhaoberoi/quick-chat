import "server-only";
import { integrationStatus, serverEnv } from "@/lib/env";
import { getSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

/**
 * Browser push via Firebase Cloud Messaging.
 *
 * Notifications are created inside the database (so they exist even if push
 * fails). Dispatch claims unsent rows atomically via
 * claim_push_notifications, so each notification is pushed at most once even
 * when the API and the cron sweeper race.
 */
type Messaging = import("firebase-admin/messaging").Messaging;
let messagingPromise: Promise<Messaging> | null = null;

async function messaging(): Promise<Messaging> {
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const { initializeApp, getApps, cert } = await import("firebase-admin/app");
      const { getMessaging } = await import("firebase-admin/messaging");
      const raw = serverEnv().FIREBASE_SERVICE_ACCOUNT!;
      const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
      const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(json)) });
      return getMessaging(app);
    })();
  }
  return messagingPromise;
}

type Claimed = { id: string; user_id: string; type: string; title: string; body: string; data: Record<string, unknown>; tokens: string[] };

/** Sends pending pushes. Pass ids to target just-created notifications. */
export async function dispatchPush(ids?: string[]): Promise<{ sent: number; failed: number }> {
  if (!integrationStatus().push || !hasServiceRole()) return { sent: 0, failed: 0 };
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc("claim_push_notifications", { p_ids: ids ?? null, p_limit: 500 });
  if (error) {
    log("error", "push_claim_failed", { error: error.message });
    return { sent: 0, failed: 0 };
  }
  const rows = (data ?? []) as Claimed[];
  if (rows.length === 0) return { sent: 0, failed: 0 };

  const fcm = await messaging();
  let sent = 0;
  let failed = 0;
  const invalid: string[] = [];
  for (const row of rows) {
    if (row.tokens.length === 0) continue;
    const url = typeof row.data?.url === "string" ? row.data.url : "/notifications";
    try {
      const res = await fcm.sendEachForMulticast({
        tokens: row.tokens.slice(0, 500),
        // Data-only payload: the service worker renders it, so the browser
        // never shows a duplicate auto-generated notification.
        data: { id: row.id, type: row.type, title: row.title, body: row.body, url, tag: row.type === "message" ? `msg-${url}` : row.id },
        webpush: { headers: { Urgency: row.type === "incoming_call" ? "high" : "normal", TTL: row.type === "incoming_call" ? "45" : "86400" } },
      });
      sent += res.successCount;
      failed += res.failureCount;
      res.responses.forEach((r, i) => {
        const code = r.error?.code ?? "";
        if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token") || code.includes("invalid-argument")) {
          invalid.push(row.tokens[i]);
        }
      });
    } catch (err) {
      failed += row.tokens.length;
      log("error", "push_send_failed", { error: (err as Error).message });
    }
  }
  if (invalid.length) await admin.from("push_subscriptions").delete().in("token", invalid);
  return { sent, failed };
}

/** Fire-and-forget dispatch of notifications created in the last few seconds. */
export async function dispatchRecentPush(): Promise<void> {
  try {
    await dispatchPush();
  } catch (err) {
    log("error", "push_dispatch_error", { error: (err as Error).message });
  }
}
