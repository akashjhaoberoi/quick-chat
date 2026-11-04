import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata = { title: "Refund and Cancellation Policy" };

export default function RefundsPage() {
  return (
    <LegalPage title="Refund and Cancellation Policy" updated="4 November 2026" current="/legal/refunds">
      <p>
        This policy covers Quick Chat Premium. Quick Chat itself (messaging, calls, Snaps, Stories, Discover and every safety feature) is free and needs
        no payment. Payments are processed by Razorpay.
      </p>
      <h2>Plans and billing</h2>
      <ul>
        <li>
          <strong>Monthly and Yearly</strong> plans are recurring subscriptions. You are charged when you subscribe and then automatically at the start
          of every billing period until you cancel.
        </li>
        <li>
          <strong>Lifetime</strong> is a one-time payment. It never renews and is never charged again.
        </li>
        <li>
          Prices are shown in Indian Rupees on the <Link href="/pricing" className="font-semibold text-brand">Pricing</Link> page and in the checkout
          before you pay.
        </li>
        <li>Premium is activated only after our server has verified the payment with Razorpay.</li>
      </ul>
      <h2>Cancelling a subscription</h2>
      <ul>
        <li>Cancel any time from Settings → Premium. No further renewals will be charged.</li>
        <li>After you cancel you keep Premium until the end of the period you have already paid for. It then ends automatically.</li>
        <li>Cancel your subscription before deleting your Quick Chat account so no further renewals are charged.</li>
      </ul>
      <h2>Refunds</h2>
      <ul>
        <li>
          If you were charged twice, charged after cancelling, or paid but Premium was not activated, contact us within 7 days of the charge and we will
          refund the incorrect amount.
        </li>
        <li>Other refund requests are reviewed case by case. Partial periods of a subscription are not refunded automatically.</li>
        <li>
          Approved refunds go back to the original payment method through Razorpay. Banks and card issuers usually take 5–7 working days to show them.
        </li>
        <li>A full refund ends the Premium access that payment bought.</li>
      </ul>
      <h2>Failed payments</h2>
      <p>
        If a payment fails, Premium is not activated. If money left your account for a failed payment, it is normally reversed automatically by your bank
        or Razorpay. If not, contact us with the payment ID.
      </p>
      <h2>Contact</h2>
      <p>
        For cancellations, refunds or billing questions see <Link href="/legal/contact" className="font-semibold text-brand">Contact Us</Link>.
      </p>
    </LegalPage>
  );
}
