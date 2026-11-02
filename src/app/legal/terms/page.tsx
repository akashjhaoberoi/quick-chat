import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="2 November 2026" current="/legal/terms">
      <p>
        These terms govern your use of Quick Chat, a messaging and social service operated by Akarika Technologies (&quot;we&quot;, &quot;us&quot;). By
        creating an account or using Quick Chat you agree to them.
      </p>
      <h2>1. Your account</h2>
      <ul>
        <li>You must be at least 13 years old, or the minimum age required in your country, to use Quick Chat.</li>
        <li>Provide accurate information, keep your password secret and turn on two-factor authentication if you can. You are responsible for activity on your account.</li>
        <li>Usernames that impersonate others or infringe trademarks may be reclaimed.</li>
      </ul>
      <h2>2. Your content</h2>
      <p>
        You keep ownership of what you post. You give us a limited licence to store, process and display your content solely to operate the service for
        you and the people you share it with. You are responsible for having the rights to what you share.
      </p>
      <h2>3. Acceptable use</h2>
      <p>
        You agree to follow our{" "}
        <Link href="/legal/community-guidelines" className="font-semibold text-brand">
          Community Guidelines
        </Link>
        . Do not use Quick Chat to break the law, harass people, distribute malware or spam, scrape data, or interfere with the service or its security.
      </p>
      <h2>4. Disappearing content</h2>
      <p>
        Snaps, Stories and disappearing messages are deleted from our servers on schedule, but recipients can still capture them (for example with a
        screenshot or another camera). Only share what you are comfortable with someone keeping.
      </p>
      <h2>5. Moderation and termination</h2>
      <p>
        We may remove content, warn, suspend or ban accounts that violate these terms or the Community Guidelines. You can appeal decisions from Settings →
        Account. You can deactivate or permanently delete your account at any time from Settings → Account.
      </p>
      <h2>6. Availability and changes</h2>
      <p>
        Quick Chat is provided &quot;as is&quot;. Features such as calls and push notifications depend on third-party infrastructure and your browser, and
        may be unavailable at times. We may update these terms; material changes will be announced in the app before they take effect.
      </p>
      <h2>7. Liability</h2>
      <p>
        To the extent permitted by law, Akarika Technologies is not liable for indirect or consequential losses arising from your use of Quick Chat. Nothing
        in these terms limits rights you have under applicable consumer law.
      </p>
      <h2>8. Privacy</h2>
      <p>
        How we handle your data is described in our{" "}
        <Link href="/legal/privacy" className="font-semibold text-brand">
          Privacy Policy
        </Link>
        .
      </p>
    </LegalPage>
  );
}
