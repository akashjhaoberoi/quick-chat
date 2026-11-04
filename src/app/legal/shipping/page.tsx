import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata = { title: "Shipping and Delivery Policy" };

export default function ShippingPage() {
  return (
    <LegalPage title="Shipping and Delivery Policy" updated="4 November 2026" current="/legal/shipping">
      <p>Quick Chat sells only a digital service, Quick Chat Premium. Nothing is shipped and there are no delivery charges.</p>
      <h2>Delivery of Premium</h2>
      <ul>
        <li>Premium is delivered to your Quick Chat account online. It is activated as soon as our server verifies your payment with Razorpay, usually within a few seconds.</li>
        <li>If Premium is not active within 24 hours of a successful payment, contact us and include the payment ID.</li>
      </ul>
      <p>
        See also the <Link href="/legal/refunds" className="font-semibold text-brand">Refund and Cancellation Policy</Link> and{" "}
        <Link href="/legal/contact" className="font-semibold text-brand">Contact Us</Link>.
      </p>
    </LegalPage>
  );
}
