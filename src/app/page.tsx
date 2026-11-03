import Link from "next/link";
import { ArrowRight, Camera, Compass, Lock, MessageCircle, Phone, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-chrome";
import { InstallButton } from "@/components/pwa/install-button";

const FEATURES = [
  { icon: MessageCircle, title: "Real-time chat", text: "One-to-one and group conversations with typing indicators, read receipts, reactions, replies, voice notes and media." },
  { icon: Camera, title: "Snaps", text: "Photos and short videos with text and stickers that disappear after they're viewed — plus streaks with your closest friends." },
  { icon: Sparkles, title: "Stories", text: "Share your day for 24 hours with friends or everyone, and see who viewed and reacted." },
  { icon: Phone, title: "Voice & video calls", text: "Crystal-clear calls with friends and groups, right in your browser." },
  { icon: Compass, title: "Discover", text: "A feed of public posts from creators and friends, with hashtags, likes and comments." },
  { icon: Lock, title: "Privacy first", text: "Choose who can message, add and see you. Block and report in two taps. Optional two-factor sign-in." },
];

/** Public landing page (signed-in visitors are redirected to /home by the proxy). */
export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-bg">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -left-32 -top-40 h-[28rem] w-[28rem] rounded-full bg-[#7c5cff]/25 blur-3xl" />
            <div className="absolute -right-24 top-24 h-[24rem] w-[24rem] rounded-full bg-[#ff5e7e]/20 blur-3xl" />
          </div>
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand">
                <Sparkles className="h-3.5 w-3.5" /> Your Moments. Your Conversations.
              </p>
              <h1 className="mt-6 font-display text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
                Connect. Chat. <span className="brand-text">Share.</span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-ink-2">
                Quick Chat brings messaging, disappearing Snaps, Stories and calls together in one fast, beautiful app that works on any device.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="brand-gradient inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-6 text-base font-bold text-white shadow-[var(--shadow-pop)] transition hover:brightness-110"
                >
                  Create your account <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-border bg-surface px-6 text-base font-semibold text-ink hover:bg-surface-2"
                >
                  Sign in
                </Link>
                <InstallButton variant="ghost" size="lg" />
              </div>
            </div>

            <div aria-hidden className="relative mx-auto w-full max-w-sm">
              <div className="rounded-[2.5rem] border border-border bg-surface p-4 shadow-[var(--shadow-pop)]">
                <div className="flex items-center gap-3 border-b border-border pb-3">
                  <span className="story-ring rounded-full p-[2.5px]">
                    <span className="block h-10 w-10 rounded-full border-2 border-surface bg-[#2e90fa]" />
                  </span>
                  <div>
                    <p className="text-sm font-bold">Maya</p>
                    <p className="text-xs text-success">Online</p>
                  </div>
                  <LogoMark className="ml-auto h-7 w-7" />
                </div>
                <div className="space-y-2.5 py-4 text-sm">
                  <p className="w-fit max-w-[80%] rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2">Sunset at the beach? 🌅</p>
                  <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md px-3.5 py-2 text-white" style={{ background: "var(--bubble-me)" }}>
                    On my way! Sending a Snap ⚡
                  </p>
                  <div className="ml-auto flex w-fit items-center gap-2 rounded-2xl rounded-br-md border border-border px-3 py-2 text-xs font-semibold text-accent">
                    <Camera className="h-4 w-4" /> Snap · tap to view
                  </div>
                  <p className="w-fit max-w-[80%] rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2">🔥 12-day streak!</p>
                </div>
                <div className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2.5 text-xs text-muted">
                  Message… <span className="ml-auto h-7 w-7 rounded-full brand-gradient" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6" aria-labelledby="features">
          <h2 id="features" className="text-center font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Everything you need to stay close
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-ink-2">Built for the way you actually talk with friends — quick, expressive and private.</p>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="group rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)] transition-transform duration-200 hover:-translate-y-1">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 font-display text-lg font-bold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="brand-gradient relative overflow-hidden rounded-[2rem] px-6 py-12 text-center text-white sm:px-12">
            <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Your Moments. Your Conversations.</h2>
            <p className="mx-auto mt-3 max-w-xl text-white/85">Join Quick Chat today — free, fast, and installable on your phone&apos;s home screen.</p>
            <Link href="/register" className="mt-7 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-6 font-bold text-[#7c5cff] hover:bg-white/90">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
