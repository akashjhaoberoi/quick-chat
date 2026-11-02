"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { emailSchema, passwordSchema } from "@/lib/validation";
import { AuthCard, AuthHeading, FormAlert } from "./auth-bits";
import { appOrigin, authErrorMessage } from "./auth-utils";
import { PasswordInput, PasswordStrengthMeter } from "./password-input";

function useCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until <= now) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [until, now]);
  const remaining = Math.max(0, Math.ceil((until - now) / 1000));
  return { remaining, start: (s: number) => { setNow(Date.now()); setUntil(Date.now() + s * 1000); } };
}

/** "Check your inbox" after sign-up, with resend. */
export function VerifyEmail() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const cooldown = useCooldown();

  async function resend(e: FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setStatus({ tone: "error", text: parsed.error.issues[0]?.message ?? "Enter a valid email" });
      return;
    }
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().auth.resend({
      type: "signup",
      email: parsed.data,
      options: { emailRedirectTo: `${appOrigin()}/auth/confirm?next=/onboarding` },
    });
    setBusy(false);
    if (error) setStatus({ tone: "error", text: authErrorMessage(error) });
    else {
      setStatus({ tone: "success", text: "Sent! A new confirmation link is on its way." });
      cooldown.start(60);
    }
  }

  return (
    <AuthCard>
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-brand-soft text-brand">
        <MailCheck className="h-7 w-7" />
      </div>
      <AuthHeading
        title="Check your inbox"
        subtitle={
          <>
            We sent a confirmation link{params.get("email") ? <> to <strong className="text-ink">{params.get("email")}</strong></> : null}. Open it on this
            device to activate your account. It may take a minute — check your spam folder too.
          </>
        }
      />
      {status ? <FormAlert tone={status.tone}>{status.text}</FormAlert> : null}
      <form onSubmit={resend} className="space-y-3" noValidate>
        <Field label="Didn't get it? Resend to">
          {(p) => <Input {...p} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />}
        </Field>
        <Button type="submit" variant="outline" size="lg" className="w-full" loading={busy} disabled={cooldown.remaining > 0}>
          {cooldown.remaining > 0 ? `Resend available in ${cooldown.remaining}s` : "Resend confirmation email"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already confirmed?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}

export function ForgotPasswordForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(params.get("error"));
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const cooldown = useCooldown();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${appOrigin()}/auth/confirm?next=/reset-password`,
    });
    setBusy(false);
    if (err && !/user not found/i.test(err.message)) {
      setError(authErrorMessage(err));
      return;
    }
    // Same response whether or not the account exists (no account enumeration).
    setSent(true);
    cooldown.start(60);
  }

  return (
    <AuthCard>
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-brand-soft text-brand">
        <KeyRound className="h-7 w-7" />
      </div>
      <AuthHeading title="Reset your password" subtitle="Enter the email you signed up with and we'll send you a reset link." />
      {error ? <FormAlert>{error}</FormAlert> : null}
      {sent ? <FormAlert tone="success">If an account exists for {email}, a reset link is on its way. The link expires after a short time.</FormAlert> : null}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email">
          {(p) => <Input {...p} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />}
        </Field>
        <Button type="submit" variant="gradient" size="lg" className="w-full" loading={busy} disabled={cooldown.remaining > 0}>
          {cooldown.remaining > 0 ? `Send again in ${cooldown.remaining}s` : sent ? "Send again" : "Send reset link"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthCard>
  );
}

/** Reached from the recovery e-mail (/auth/confirm creates a recovery session). */
export function ResetPasswordForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [state, setState] = useState<"checking" | "ready" | "no_session">("checking");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        setEmail(data.user?.email ?? "");
        setState(data.user ? "ready" : "no_session");
      });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    const fe: typeof errors = {};
    if (!parsed.success) fe.password = parsed.error.issues[0]?.message;
    if (password !== confirm) fe.confirm = "Passwords don't match";
    setErrors(fe);
    if (fe.password || fe.confirm) return;
    setBusy(true);
    setFormError(null);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      if (error.code === "insufficient_aal") {
        router.push("/login/mfa?next=/reset-password");
        return;
      }
      setFormError(authErrorMessage(error));
      return;
    }
    await api.post("/api/auth/security-event", { event: "password_reset" }).catch(() => undefined);
    queryClient.clear();
    router.replace("/home");
    router.refresh();
  }

  if (state === "checking") {
    return (
      <AuthCard className="flex justify-center py-16">
        <Spinner />
      </AuthCard>
    );
  }

  if (state === "no_session") {
    return (
      <AuthCard>
        <AuthHeading title="Link expired" subtitle="This password reset link is invalid or has expired. Request a new one to continue." />
        <Link href="/forgot-password" className="brand-gradient inline-flex h-12 w-full items-center justify-center rounded-2xl text-base font-semibold text-white">
          Request a new link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthHeading title="Choose a new password" subtitle={email ? <>For <strong className="text-ink">{email}</strong></> : undefined} />
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="New password" error={errors.password}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />}
        </Field>
        <PasswordStrengthMeter password={password} context={[email.split("@")[0]]} />
        <Field label="Confirm new password" error={errors.confirm}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
        </Field>
        <Button type="submit" variant="gradient" size="lg" className="w-full" loading={busy}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
