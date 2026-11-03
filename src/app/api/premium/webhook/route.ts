import { NextResponse, type NextRequest } from "next/server";
import { log } from "@/lib/log";
import { applyPayment, audit } from "@/lib/premium";
import type { PlanId } from "@/lib/premium-plans";
import { periodEnd, razorpayConfigured, verifyWebhookSignature, type RzpPayment, type RzpSubscription } from "@/lib/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type Payload = {
  event: string;
  payload: {
    payment?: { entity: RzpPayment };
    subscription?: { entity: RzpSubscription };
    refund?: { entity: { id: string; payment_id: string; amount: number } };
    order?: { entity: { id: string } };
  };
};

const SUB_STATUS: Partial<Record<string, string>> = {
  "subscription.halted": "halted",
  "subscription.cancelled": "cancelled",
  "subscription.completed": "cancelled",
};

/**
 * POST /api/premium/webhook — Razorpay webhooks. Verified with the webhook
 * secret over the raw body; each event id is processed once (a retry of an
 * event that failed is processed again). Not session-authenticated: the
 * signature is the authentication.
 */
export async function POST(req: NextRequest) {
  if (!razorpayConfigured()) return NextResponse.json({ ok: false }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 256 * 1024) return NextResponse.json({ ok: false }, { status: 413 });
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature") ?? "")) {
    log("warn", "razorpay_webhook_bad_signature", {});
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let body: Payload;
  try {
    body = JSON.parse(raw) as Payload;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const eventId = req.headers.get("x-razorpay-event-id") ?? `${body.event}:${body.payload.payment?.entity.id ?? body.payload.subscription?.entity.id ?? ""}:${raw.length}`;
  const { error: insertError } = await admin.from("payment_webhook_events").insert({ id: eventId, event: body.event, payload: body });
  if (insertError) {
    const { data: seen } = await admin.from("payment_webhook_events").select("processed_at").eq("id", eventId).maybeSingle();
    if (seen?.processed_at) return NextResponse.json({ ok: true, duplicate: true });
    if (!seen) {
      log("error", "razorpay_webhook_store_failed", { error: insertError.message });
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  }

  try {
    await handle(body);
    await admin.from("payment_webhook_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", eventId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = (err as Error).message;
    log("error", "razorpay_webhook_failed", { event: body.event, error: message });
    await admin.from("payment_webhook_events").update({ error: message.slice(0, 500) }).eq("id", eventId);
    // 500 makes Razorpay retry; the retry is reprocessed because processed_at is unset.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

async function handle(body: Payload) {
  const admin = getSupabaseAdmin();
  const payment = body.payload.payment?.entity;
  const sub = body.payload.subscription?.entity;

  switch (body.event) {
    case "payment.captured":
    case "payment.failed":
    case "order.paid": {
      if (!payment?.order_id) return;
      // Only one-time (lifetime) orders are matched here; subscription charges arrive as subscription.charged.
      const { data: tx } = await admin
        .from("payment_transactions")
        .select("user_id, plan_id")
        .eq("razorpay_order_id", payment.order_id)
        .is("razorpay_subscription_id", null)
        .limit(1)
        .maybeSingle();
      if (!tx) return;
      try {
        await applyPayment({ userId: tx.user_id, plan: tx.plan_id as PlanId, payment, orderId: payment.order_id, source: "webhook" });
      } catch (err) {
        // A failed payment for an already-captured order is just history.
        if (body.event !== "payment.failed") throw err;
      }
      return;
    }
    case "subscription.activated":
    case "subscription.charged": {
      if (!sub) return;
      const { data: row } = await admin.from("user_subscriptions").select("user_id, plan_id").eq("razorpay_subscription_id", sub.id).maybeSingle();
      if (!row) return;
      if (!payment) return; // activated without a payment entity: wait for charged.
      await applyPayment({ userId: row.user_id, plan: row.plan_id as PlanId, payment, subscriptionId: sub.id, periodEnd: periodEnd(sub), source: "webhook" });
      return;
    }
    case "subscription.pending": {
      if (!sub) return;
      const { data: row } = await admin.from("user_subscriptions").select("user_id").eq("razorpay_subscription_id", sub.id).maybeSingle();
      if (row) await audit(row.user_id, "renewal_failed_retrying", { subscription: sub.id });
      return;
    }
    case "subscription.halted":
    case "subscription.cancelled":
    case "subscription.completed": {
      if (!sub) return;
      const status = SUB_STATUS[body.event]!;
      const { data: row } = await admin
        .from("user_subscriptions")
        .update({
          status,
          cancel_at_period_end: status === "cancelled" ? true : undefined,
          cancelled_at: status === "cancelled" ? new Date().toISOString() : undefined,
        })
        .eq("razorpay_subscription_id", sub.id)
        .in("status", ["active", "halted", "cancelled", "pending"])
        .select("user_id")
        .maybeSingle();
      if (row) await audit(row.user_id, body.event.replace(".", "_"), { subscription: sub.id });
      return;
    }
    case "refund.created":
    case "refund.processed":
    case "payment.refunded": {
      const paymentId = body.payload.refund?.entity.payment_id ?? payment?.id;
      const refunded = payment?.amount_refunded ?? body.payload.refund?.entity.amount ?? 0;
      if (!paymentId || refunded <= 0) return;
      const { error } = await admin.rpc("premium_apply_refund", { p_payment_id: paymentId, p_refunded_paise: refunded });
      if (error) throw new Error(error.message);
      return;
    }
    default:
      return;
  }
}
