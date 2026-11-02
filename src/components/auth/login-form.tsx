"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useTheme } from "@/components/providers/theme-provider";
import { getSupabaseBrowserClient, resetSupabaseBrowserClient } from "@/lib/supabase/client";
import { loginSchema } from "@/lib/validation";
import { AuthCard, AuthHeading, Divider, FormAlert, GoogleButton } from "./auth-bits";
import { authErrorMessage, finishSignIn, safeNext, setRememberPreference } from "./auth-utils";
import { PasswordInput } from "./password-input";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { setTheme } = useTheme();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(params.get("error"));
  const [busy, setBusy] = useState(false);
  const notice =
    params.get("deactivated") === "1"
      ? "Your account is deactivated. Sign in any time to reactivate it."
      : params.get("deleted") === "1"
        ? "Your account and data have been deleted."
        : params.get("reset") === "1"
          ? "Password updated. Sign in with your new password."
          : null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = loginSchema.safeParse({ email, password, remember });
    if (!parsed.success) {
      const fe: typeof errors = {};
      for (const issue of parsed.error.issues) fe[issue.path[0] as "email" | "password"] ??= issue.message;
      setErrors(fe);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      setRememberPreference(parsed.data.remember);
      resetSupabaseBrowserClient();
      const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
      if (error) {
        setFormError(authErrorMessage(error));
        return;
      }
      const { target } = await finishSignIn(next, setTheme);
      queryClient.clear();
      router.replace(target);
      router.refresh();
    } catch (err) {
      setFormError(authErrorMessage(err as Error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard>
      <AuthHeading title="Welcome back" subtitle="Sign in to pick up where you left off." />
      {notice ? <FormAlert tone="info">{notice}</FormAlert> : null}
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email" error={errors.email}>
          {(p) => (
            <Input {...p} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
          )}
        </Field>
        <Field label="Password" error={errors.password}>
          {(p) => <PasswordInput {...p} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <div className="flex items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-2">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded accent-[var(--brand)]" />
            Remember me
          </label>
          <Link href="/forgot-password" className="text-sm font-semibold text-brand hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" variant="gradient" size="lg" className="w-full" loading={busy}>
          Sign in
        </Button>
      </form>
      <Divider />
      <GoogleButton next={next} />
      <p className="mt-6 text-center text-sm text-muted">
        New to Quick Chat?{" "}
        <Link href={next !== "/home" ? `/register?next=${encodeURIComponent(next)}` : "/register"} className="font-semibold text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}
