import { LegalPage } from "@/components/marketing/legal-page";

export const metadata = { title: "Community Guidelines" };

export default function GuidelinesPage() {
  return (
    <LegalPage title="Community Guidelines" updated="2 November 2026" current="/legal/community-guidelines">
      <p>Quick Chat is for staying close to the people you care about. These guidelines keep it safe and welcoming, and apply to everything you share.</p>
      <h2>Not allowed</h2>
      <ul>
        <li>Harassment, bullying, threats, or encouraging others to target someone.</li>
        <li>Hate speech or attacks based on race, ethnicity, religion, nationality, gender, sexual orientation, disability or similar characteristics.</li>
        <li>Any sexual content involving minors, and sharing sexual content of anyone without their consent.</li>
        <li>Unsolicited sexual content, and nudity in public Stories or Discover posts.</li>
        <li>Graphic violence, or content promoting self-harm or suicide.</li>
        <li>Scams, fraud, phishing, spam, fake engagement and malware.</li>
        <li>Impersonating people, brands or organisations.</li>
        <li>Selling illegal goods or services, or other illegal activity.</li>
        <li>Sharing someone&apos;s private information (addresses, IDs, private photos) without permission.</li>
      </ul>
      <h2>Respect consent</h2>
      <p>Disappearing content is meant to disappear. Don&apos;t capture or re-share someone&apos;s Snaps, Stories or messages without their permission.</p>
      <h2>Reporting and enforcement</h2>
      <ul>
        <li>Report users, messages, Stories, posts, comments or groups from their menus. Reports are confidential.</li>
        <li>Moderators review only the reported content. Depending on severity we may remove content, warn, suspend or ban an account.</li>
        <li>You&apos;ll be notified of decisions affecting your account and can appeal each one once from Settings → Account.</li>
      </ul>
      <h2>If you&apos;re in danger</h2>
      <p>If you or someone else is in immediate danger, contact local emergency services first.</p>
    </LegalPage>
  );
}
