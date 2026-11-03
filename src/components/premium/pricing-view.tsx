"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Crown, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { errorMessage } from "@/lib/api/client";
import { PLANS, PREMIUM_FEATURES, type PlanId } from "@/lib/premium-plans";
import { cn } from "@/lib/utils";
import { startCheckout } from "./checkout";
import { currentSubscription, PREMIUM_KEY, usePremium } from "./use-premium";

/** /premium — Quick Chat Premium plans and Razorpay checkout. */
export function PricingView() {
  const premium = usePremium();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<PlanId | null>(null);
  const current = currentSubscription(premium.data);
  const configured = premium.data?.configured ?? false;

  async function buy(planId: PlanId) {
    setBusy(planId);
    try {
      const r = await startCheckout(planId);
      if (r.outcome === "activated") toast.success("Welcome to Quick Chat Premium!");
      else if (r.outcome === "processing") toast("Payment received — we'll switch on Premium as soon as Razorpay confirms it.");
      else if (r.outcome === "cancelled") toast("Payment cancelled. You haven't been charged.");
      else toast.error(r.message);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: PREMIUM_KEY });
    }
  }

  return (
    <PageContainer className="pb-12">
      <PageHeader title="Quick Chat Premium" subtitle="Extras for your profile, uploads and calls. Messaging stays free." back="/settings/premium" />
      <div className="space-y-6 px-4 md:px-6">
        {current ? (
          <p className="flex items-center gap-2 rounded-2xl bg-brand-soft p-3 text-sm font-semibold text-ink">
            <Crown className="h-4 w-4 text-brand" />
            You have Premium ({current.plan_id === "lifetime" ? "Lifetime" : current.plan_id === "yearly" ? "Yearly" : "Monthly"}).{" "}
            <Link href="/settings/premium" className="underline">
              Manage
            </Link>
          </p>
        ) : null}
        {premium.data && !configured ? (
          <p className="rounded-2xl border border-border bg-surface-2 p-3 text-sm text-ink-2">Payments aren&apos;t switched on yet, so plans can&apos;t be bought right now.</p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3" data-testid="pricing-cards">
          {PLANS.map((plan) => {
            const owned = current?.plan_id === plan.id || current?.plan_id === "lifetime";
            const blocked = !configured || owned || (current?.status === "active" && current.plan_id !== "lifetime" && plan.id !== "lifetime");
            return (
              <section
                key={plan.id}
                aria-label={`${plan.name} plan`}
                data-plan={plan.id}
                className={cn(
                  "relative flex flex-col rounded-3xl border bg-surface p-5 shadow-[var(--shadow-soft)]",
                  plan.highlight ? "border-brand ring-4 ring-[var(--ring)]" : "border-border",
                )}
              >
                {plan.highlight ? (
                  <span className="absolute -top-3 left-5 rounded-full bg-brand px-3 py-0.5 text-xs font-bold text-[var(--brand-ink)]">{plan.highlight}</span>
                ) : null}
                <h2 className="font-display text-lg font-bold">{plan.name}</h2>
                <p className="mt-2">
                  <span className="font-display text-4xl font-extrabold tracking-tight" data-testid="plan-price">
                    {plan.price}
                  </span>{" "}
                  <span className="text-sm text-muted">{plan.cadence}</span>
                </p>
                <p className="mt-2 flex-1 text-sm text-ink-2">{plan.terms}</p>
                <Button
                  className="mt-4 w-full"
                  variant={plan.highlight ? "gradient" : "outline"}
                  disabled={blocked || busy !== null}
                  onClick={() => void buy(plan.id)}
                  aria-label={`Choose ${plan.name}`}
                >
                  {busy === plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : !configured ? <Lock className="h-4 w-4" /> : null}
                  {owned ? "Your plan" : plan.id === "lifetime" ? "Pay once" : "Subscribe"}
                </Button>
              </section>
            );
          })}
        </div>

        <section aria-label="What you get" className="rounded-3xl border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-bold">What Premium includes</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {PREMIUM_FEATURES.map((f) => (
              <li key={f.key} className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>
                  <span className="block text-sm font-semibold">{f.title}</span>
                  <span className="block text-xs text-muted">{f.description}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">Chats, calls, Snaps, Stories, account security and privacy controls stay free for everyone.</p>
        </section>

        <section aria-label="Billing terms" className="space-y-1.5 text-xs text-muted">
          <p>Prices are in Indian rupees (INR) and include all applicable taxes. The amount shown is the amount charged.</p>
          <p>
            Monthly and yearly plans renew automatically at the same price until you cancel in Settings → Premium. Cancelling stops the next renewal; Premium stays on until the
            end of the period you&apos;ve paid for. Lifetime is a single payment with no renewals.
          </p>
          <p>
            Payments are processed by Razorpay. You can pay with UPI, cards, net banking or wallets — the exact options shown in the payment window depend on what&apos;s enabled
            for Quick Chat and your bank. Quick Chat never sees or stores your card number, CVV or UPI PIN.
          </p>
          <p>
            Premium switches on only after Razorpay confirms the payment. If you&apos;re charged and Premium doesn&apos;t switch on within a few minutes, contact support with your
            payment ID from Settings → Premium.
          </p>
        </section>
      </div>
    </PageContainer>
  );
}
