import { LegalPage } from "@/components/marketing/legal-page";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="2 November 2026" current="/legal/privacy">
      <p>This policy explains what Quick Chat (operated by Akarika Technologies) collects, why, and the choices you have.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account data: email, username, display name, bio, profile and cover photos, and your settings.</li>
        <li>Content you create: messages, media, Snaps, Stories, posts, comments and reactions.</li>
        <li>Social graph: friends, friend requests, follows and blocks.</li>
        <li>Security data: sign-in events with IP address, browser/device label and time, so you can review your login activity.</li>
        <li>Technical data: push notification tokens for devices where you enable push, and basic error logs.</li>
      </ul>
      <h2>How your data is protected</h2>
      <ul>
        <li>All traffic between your device and our servers is encrypted in transit using TLS.</li>
        <li>Stored data and media are encrypted at rest by our infrastructure providers (database and object storage).</li>
        <li>
          <strong>Messages are not end-to-end encrypted.</strong> They are stored on our servers so they sync across your devices, and access controls
          ensure only conversation members can read them.
        </li>
        <li>Media is never public: every file is served through short-lived, access-checked links.</li>
      </ul>
      <h2>Disappearing content</h2>
      <p>
        Snaps, expired Stories and disappearing messages are deleted from our servers on schedule. However, recipients can still capture content on their
        screens (for example by screenshot, screen recording or another camera). Screenshot alerts are best-effort only — browsers cannot reliably detect
        every capture.
      </p>
      <h2>Location</h2>
      <p>Your location is shared only when you explicitly choose to share it in a chat, and only with that conversation. You can stop sharing at any time.</p>
      <h2>Who can see your data</h2>
      <ul>
        <li>Other users see what you share with them, subject to your privacy settings (private account, who can message you, last-active visibility and more).</li>
        <li>
          Moderators only see content that was reported to them — for a reported message, only that message as the reporter saw it. Moderators cannot
          browse your private conversations.
        </li>
        <li>
          Service providers process data on our behalf to run the service: database and authentication hosting, media storage, voice/video call relay, push
          delivery and email delivery.
        </li>
        <li>We do not sell your personal data or use your messages for advertising.</li>
      </ul>
      <h2>Your choices and rights</h2>
      <ul>
        <li>Edit your profile and privacy settings at any time in Settings.</li>
        <li>Deactivate your account (hidden, restored when you sign in) or delete it permanently, which removes your profile, uploaded media and content.</li>
        <li>Turn push notifications and security emails on or off in Settings → Notifications.</li>
        <li>Depending on where you live, you may have rights to access, correct, export or erase your data.</li>
      </ul>
      <h2>Retention</h2>
      <p>
        We keep your data while your account exists. Disappearing content is deleted on its schedule; deleted accounts are removed promptly, with backups
        expiring on our providers&apos; standard cycles. Login activity is kept while your account exists so you can review it.
      </p>
      <h2>Changes</h2>
      <p>We will announce material changes to this policy in the app before they take effect.</p>
    </LegalPage>
  );
}
