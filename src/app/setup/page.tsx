import Link from "next/link";
import { Wrench } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SetupStatus } from "@/components/marketing/setup-status";

export const metadata = { title: "Setup" };

const STEPS = [
  "Create a Supabase project and copy the project URL, anon key and service role key (Project Settings → API).",
  "Copy .env.example to .env.local and fill in the required values. Never put secrets in NEXT_PUBLIC_* variables.",
  "Apply the SQL migrations in supabase/migrations (supabase db push, or run them in order in the SQL editor).",
  "Configure Auth redirect URLs to include <app URL>/auth/callback and <app URL>/auth/confirm, and enable Google if you want social sign-in.",
  "Restart the server. This page shows live status below; optional integrations can be added at any time.",
];

/** Shown when Supabase isn't configured (the proxy redirects here). */
export default function SetupPage() {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Quick Chat home">
          <Logo />
        </Link>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 pb-16 sm:px-6">
        <div className="rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)] sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <Wrench className="h-6 w-6" />
          </span>
          <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight">Finish setting up Quick Chat</h1>
          <p className="mt-2 text-ink-2">
            Quick Chat needs a Supabase project to run. Optional integrations (media storage, calls, push, email, Redis) can be added later — the
            app hides those features until they&apos;re configured. Full step-by-step instructions are in <code className="rounded bg-surface-2 px-1.5 py-0.5 text-sm">docs/SETUP.md</code>.
          </p>
          <ol className="mt-6 space-y-3">
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="brand-gradient flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">{i + 1}</span>
                <span className="text-ink-2">{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)] sm:p-8">
          <h2 className="font-display text-xl font-bold">Live integration status</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Reported by /api/health. Only whether each value is present is shown — never the values themselves.</p>
          <SetupStatus />
        </div>
      </main>
    </div>
  );
}
