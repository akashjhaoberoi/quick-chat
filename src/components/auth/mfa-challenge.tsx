"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import type { Factor } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/feedback";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { AuthCard, AuthHeading, FormAlert } from "./auth-bits";
import { authErrorMessage, safeNext } from "./auth-utils";

/** Second sign-in step for accounts with a verified TOTP authenticator. */
export function MfaChallenge() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const next = safeNext(params.get("next"));
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [factorId, setFactorId] = useState<string>("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") {
        router.replace(next);
        return;
      }
      const { data, error: err } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (err) {
        setError(authErrorMessage(err));
        setFactors([]);
        return;
      }
      const totp = data.totp ?? [];
      setFactors(totp);
      setFactorId(totp[0]?.id ?? "");
      if (totp.length === 0) router.replace(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(clean)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId, code: clean });
    if (err) {
      setError(authErrorMessage(err));
      setBusy(false);
      setCode("");
      return;
    }
    queryClient.clear();
    router.replace(next);
    router.refresh();
  }

  async function switchAccount() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    await getSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
  }

  return (
    <AuthCard>
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-3xl bg-brand-soft text-brand">
        <ShieldCheck className="h-7 w-7" />
      </div>
      <AuthHeading title="Two-factor verification" subtitle="Open your authenticator app and enter the 6-digit code for Quick Chat." />
      {params.get("mfa") === "required" ? <FormAlert tone="info">This area requires two-factor verification.</FormAlert> : null}
      {error ? <FormAlert>{error}</FormAlert> : null}
      {factors === null ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {factors.length > 1 ? (
            <Field label="Authenticator">
              {(p) => (
                <select
                  {...p}
                  value={factorId}
                  onChange={(e) => setFactorId(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]"
                >
                  {factors.map((f, i) => (
                    <option key={f.id} value={f.id}>
                      {f.friendly_name || `Authenticator ${i + 1}`}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ) : null}
          <Field label="Verification code">
            {(p) => (
              <Input
                {...p}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, "").slice(0, 7))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="text-center font-display text-2xl tracking-[0.5em]"
                autoFocus
              />
            )}
          </Field>
          <Button type="submit" variant="gradient" size="lg" className="w-full" loading={busy} disabled={!factorId}>
            Verify
          </Button>
        </form>
      )}
      <button type="button" onClick={() => void switchAccount()} className="mt-5 w-full text-center text-sm font-semibold text-muted hover:text-ink">
        Sign in with a different account
      </button>
    </AuthCard>
  );
}
