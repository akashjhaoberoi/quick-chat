import Link from "next/link";
import { preconnect } from "react-dom";
import { Camera, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { InstallButton } from "@/components/pwa/install-button";
import { publicEnv } from "@/lib/env";

const POINTS = [
  { icon: MessageCircle, title: "Real-time chat", text: "Typing indicators, reactions, voice notes and groups." },
  { icon: Camera, title: "Snaps & Stories", text: "Share moments that disappear on your terms." },
  { icon: ShieldCheck, title: "You're in control", text: "Granular privacy, blocking and two-factor sign-in." },
];

/** Split layout: brand panel on desktop, single column on mobile. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // Warm up the connections sign-in needs before the user clicks: the password
  // request is a CORS fetch (anonymous pool), Google's start is a navigation
  // (credentialed pool) to Supabase and then accounts.google.com.
  const supabase = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
  if (supabase) {
    preconnect(supabase, { crossOrigin: "anonymous" });
    preconnect(supabase);
  }
  preconnect("https://accounts.google.com");
  return (
    <div className="flex min-h-dvh bg-bg">
      <aside className="brand-gradient relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-black/10 blur-3xl" />
        <Link href="/" className="relative inline-flex w-fit rounded-2xl bg-white/95 px-3 py-2 text-ink shadow-[var(--shadow-soft)]">
          <Logo />
        </Link>
        <div className="relative">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="h-3.5 w-3.5" /> Your Moments. Your Conversations.
          </p>
          <h2 className="mt-5 font-display text-4xl font-extrabold leading-tight tracking-tight xl:text-5xl">
            Connect.
            <br />
            Chat.
            <br />
            Share.
          </h2>
          <ul className="mt-10 space-y-5">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-bold">{title}</span>
                  <span className="block text-sm text-white/80">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/70">© Akarika Technologies</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-5 pt-5 lg:hidden">
          <Link href="/" aria-label="Quick Chat home">
            <Logo />
          </Link>
          <InstallButton variant="outline" size="sm" label="Install" />
        </header>
        <div className="hidden justify-end px-6 pt-5 lg:flex">
          <InstallButton variant="outline" size="sm" />
        </div>
        <main className="flex flex-1 items-center justify-center px-5 py-10">
          <div className="w-full max-w-md">{children}</div>
        </main>
        <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 pb-6 text-xs text-muted">
          <Link href="/legal/terms" className="hover:text-ink">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/legal/community-guidelines" className="hover:text-ink">Community Guidelines</Link>
          <span className="lg:hidden">© Akarika Technologies</span>
        </footer>
      </div>
    </div>
  );
}
