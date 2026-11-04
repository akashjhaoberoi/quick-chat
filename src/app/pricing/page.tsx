import Link from "next/link";
import { Check, Crown } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { PLANS, PREMIUM_FEATURES } from "@/lib/premium-plans";

export const metadata = { title: "Pricing", description: "Quick Chat is free. Quick Chat Premium adds themes, a badge, analytics and bigger uploads." };

/** Public pricing page (no sign-in needed). Amounts charged always come from the server's plan table. */
export default function PricingPage() {
  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand">
            <Crown className="h-3.5 w-3.5" aria-hidden /> Quick Chat Premium
          </p>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Simple pricing</h1>
          <p className="mx-auto mt-3 max-w-xl text-ink-2">
            Chatting, calls, Snaps, Stories, Discover and every safety feature are free. Premium is optional and adds extras.
          </p>
        </div>

        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {PLANS.map((p) => (
            <li key={p.id} className={`relative flex flex-col rounded-3xl border bg-surface p-6 ${p.highlight ? "border-brand ring-4 ring-[var(--ring)]" : "border-border"}`}>
              {p.highlight ? (
                <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-0.5 text-xs font-bold text-brand-ink">{p.highlight}</span>
              ) : null}
              <h2 className="font-display text-lg font-bold">{p.name}</h2>
              <p className="mt-2">
                <span className="font-display text-3xl font-extrabold">{p.price}</span> <span className="text-sm text-muted">{p.cadence}</span>
              </p>
              <p className="mt-3 flex-1 text-sm text-ink-2">{p.terms}</p>
              <Link href="/premium" className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-brand text-sm font-bold text-brand-ink hover:brightness-95">
                Choose {p.name}
              </Link>
            </li>
          ))}
        </ul>

        <section className="mt-12 rounded-3xl border border-border bg-surface p-6 sm:p-8">
          <h2 className="font-display text-xl font-bold">What Premium includes</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {PREMIUM_FEATURES.map((f) => (
              <li key={f.key} className="flex gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
                <span>
                  <span className="block font-semibold">{f.title}</span>
                  <span className="block text-sm text-muted">{f.description}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 space-y-2 text-sm text-ink-2">
          <h2 className="font-display text-lg font-bold text-ink">Billing terms</h2>
          <p>Prices are in Indian Rupees and include any applicable taxes shown at checkout. Payments are processed securely by Razorpay.</p>
          <p>
            Monthly and Yearly plans renew automatically at the end of each period until you cancel in Settings → Premium. Cancelling stops future renewals
            and keeps Premium until the end of the paid period. Lifetime is a single payment with no renewals.
          </p>
          <p>
            Read the <Link href="/legal/refunds" className="font-semibold text-brand">Refund and Cancellation Policy</Link> and{" "}
            <Link href="/legal/terms" className="font-semibold text-brand">Terms of Service</Link>, or{" "}
            <Link href="/legal/contact" className="font-semibold text-brand">contact us</Link>.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
