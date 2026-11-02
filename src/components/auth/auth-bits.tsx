"use client";

import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { authErrorMessage } from "./auth-utils";
import { cn } from "@/lib/utils";

export function AuthHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
    </div>
  );
}

export function AuthCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn("rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)] sm:p-8", className)}
    >
      {children}
    </motion.div>
  );
}

export function FormAlert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mb-4 flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-sm font-medium",
        tone === "error" && "bg-danger-soft text-danger",
        tone === "success" && "bg-success/12 text-success",
        tone === "info" && "bg-brand-soft text-brand",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function Divider({ label = "or" }: { label?: string }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-muted">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58V6.6H1.27a12 12 0 0 0 0 10.8l4.01-3.11Z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.27 6.6l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z" />
    </svg>
  );
}

/** "Continue with Google" — Supabase OAuth (PKCE) returning to /auth/callback. */
export function GoogleButton({ next, label = "Continue with Google", disabled }: { next: string; label?: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        loading={busy}
        disabled={disabled}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const { error: err } = await getSupabaseBrowserClient().auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
          });
          if (err) {
            setError(/provider is not enabled|unsupported provider/i.test(err.message) ? "Google sign-in isn't enabled on this server yet." : authErrorMessage(err));
            setBusy(false);
          }
        }}
      >
        {!busy ? <GoogleIcon /> : null}
        {label}
      </Button>
    </>
  );
}
