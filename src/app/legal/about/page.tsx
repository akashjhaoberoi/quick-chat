import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import { business } from "@/lib/business";

export const metadata = { title: "About Us" };

export default function AboutPage() {
  return (
    <LegalPage title="About Us" updated="4 November 2026" current="/legal/about">
      <p>
        Quick Chat is a messaging and social app built and operated by {business.name}. It brings real-time chat, disappearing Snaps, Stories, voice and
        video calls and a Discover feed together in one place, in the browser and as an installable app.
      </p>
      <h2>What Quick Chat offers</h2>
      <ul>
        <li>One-to-one and group chats with typing indicators, reactions, voice notes and read receipts.</li>
        <li>Snaps and Stories that expire on schedule, with privacy controls for who can see them.</li>
        <li>Audio and video calls with live effects.</li>
        <li>Discover, a feed of public posts from creators you follow and the wider community.</li>
        <li>
          Optional <Link href="/pricing" className="font-semibold text-brand">Quick Chat Premium</Link>, which adds themes, a profile badge, profile
          analytics and larger uploads. Messaging and safety features are free for everyone.
        </li>
      </ul>
      <h2>Safety and privacy</h2>
      <p>
        Read how we handle your data in the <Link href="/legal/privacy" className="font-semibold text-brand">Privacy Policy</Link> and what we expect
        from members in the <Link href="/legal/community-guidelines" className="font-semibold text-brand">Community Guidelines</Link>.
      </p>
      <h2>Get in touch</h2>
      <p>
        See <Link href="/legal/contact" className="font-semibold text-brand">Contact Us</Link>.
      </p>
    </LegalPage>
  );
}
