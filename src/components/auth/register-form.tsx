"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { useAppConfig } from "@/hooks/use-app-config";
import { getSupabaseBrowserClient, resetSupabaseBrowserClient } from "@/lib/supabase/client";
import { registerSchema } from "@/lib/validation";
import { AuthCard, AuthHeading, Divider, FormAlert, GoogleButton } from "./auth-bits";
import { appOrigin, authErrorMessage, finishSignIn, safeNext, setRememberPreference } from "./auth-utils";
import { PasswordInput, PasswordStrengthMeter } from "./password-input";
import { UsernameField, useUsernameAvailability } from "./username-field";

type Errors = Partial<Record<"email" | "password" | "username" | "displayName" | "acceptTerms", string>>;

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const config = useAppConfig();
  const next = safeNext(params.get("next"), "/onboarding");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const availability = useUsernameAvailability(username);

  if (config.isPending) {
    return (
      <AuthCard>
        <Skeleton className="mb-3 h-8 w-2/3" />
        <Skeleton className="mb-8 h-4 w-1/2" />
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      </AuthCard>
    );
  }

  if (config.data?.registrationOpen === false) {
    return (
      <AuthCard>
        <EmptyState
          icon={<Lock />}
          title="Registration is closed"
          description="Quick Chat isn't accepting new accounts right now. Please check back later."
          action={
            <Link href="/login" className="font-semibold text-brand hover:underline">
              Already have an account? Sign in
            </Link>
          }
        />
      </AuthCard>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = registerSchema.safeParse({ email, password, username, displayName, acceptTerms });
    if (!parsed.success) {
      const fe: Errors = {};
      for (const issue of parsed.error.issues) fe[issue.path[0] as keyof Errors] ??= issue.message;
      setErrors(fe);
      return;
    }
    if (!availability.ok) {
      setErrors({ username: availability.checking ? "Still checking availability…" : availability.error ?? "Choose an available username" });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      setRememberPreference(true);
      resetSupabaseBrowserClient();
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          emailRedirectTo: `${appOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`,
          data: { username: parsed.data.username, display_name: parsed.data.displayName },
        },
      });
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      // Supabase returns a user with no identities when the e-mail is already registered (enumeration protection).
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        router.push(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
        return;
      }
      if (data.session) {
        const { target } = await finishSignIn(next);
        queryClient.clear();
        router.replace(target);
        router.refresh();
        return;
      }
      router.push(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
    } catch (err) {
      setFormError(authErrorMessage(err as Error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard>
      <AuthHeading title="Create your account" subtitle="Join Quick Chat — it only takes a minute." />
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Display name" error={errors.displayName}>
          {(p) => <Input {...p} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" maxLength={50} placeholder="Your name" autoFocus />}
        </Field>
        <div>
          <UsernameField value={username} onChange={setUsername} availability={availability} />
          {errors.username && !availability.error ? <p className="mt-1.5 text-xs font-medium text-danger">{errors.username}</p> : null}
        </div>
        <Field label="Email" error={errors.email}>
          {(p) => <Input {...p} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />}
        </Field>
        <Field label="Password" error={errors.password}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <PasswordStrengthMeter password={password} context={[username, displayName, email.split("@")[0]]} />
        <div>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
              aria-invalid={errors.acceptTerms ? true : undefined}
            />
            <span>
              I agree to the{" "}
              <Link href="/legal/terms" target="_blank" className="font-semibold text-brand hover:underline">
                Terms
              </Link>
              ,{" "}
              <Link href="/legal/privacy" target="_blank" className="font-semibold text-brand hover:underline">
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link href="/legal/community-guidelines" target="_blank" className="font-semibold text-brand hover:underline">
                Community Guidelines
              </Link>
              .
            </span>
          </label>
          {errors.acceptTerms ? (
            <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
              {errors.acceptTerms}
            </p>
          ) : null}
        </div>
        <Button type="submit" variant="gradient" size="lg" className="w-full" loading={busy}>
          Create account
        </Button>
      </form>
      <Divider />
      <GoogleButton next={next} label="Sign up with Google" />
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
