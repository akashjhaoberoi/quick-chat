import { ContactDetails } from "@/components/marketing/contact-details";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata = { title: "Contact Us" };

export default function ContactPage() {
  return (
    <LegalPage title="Contact Us" updated="4 November 2026" current="/legal/contact">
      <p>Questions about your account, Quick Chat Premium, a payment or a refund? Reach us using the details below.</p>
      <h2>Customer support</h2>
      <ContactDetails />
      <h2>In the app</h2>
      <ul>
        <li>Report a user, message or post from its menu. Our moderators review reports.</li>
        <li>Appeal a moderation decision from Settings → Account.</li>
        <li>See your Premium plan and payment history in Settings → Premium.</li>
      </ul>
      <p>When writing about a payment, include the Razorpay payment ID shown in your payment history so we can find it quickly.</p>
    </LegalPage>
  );
}
