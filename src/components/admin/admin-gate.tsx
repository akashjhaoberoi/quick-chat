"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Lock, ShieldAlert, ShieldCheck } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { Button } from "@/components/ui/button";
import { ErrorState, Spinner } from "@/components/ui/feedback";
import { LogoMark } from "@/components/brand/logo";
import { api, ClientApiError } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { adminKeys } from "./keys";
import { hasRole, ROLE_LABEL, type AdminMe, type AdminRole } from "./types";

const AdminContext = createContext<AdminMe | null>(null);

/** The verified admin identity (role comes from the server, not the client). */
export function useAdmin(): AdminMe {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminGate");
  return ctx;
}

function isMfaError(error: unknown) {
  return error instanceof ClientApiError && error.code === "mfa_required";
}

function CenteredCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 text-center shadow-[var(--shadow-pop)] sm:p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-brand-soft text-brand [&>svg]:h-7 [&>svg]:w-7">
          {icon}
        </div>
        <h1 className="font-display text-xl font-extrabold">{title}</h1>
        <div className="mt-2 space-y-4 text-sm text-muted">{children}</div>
      </div>
    </main>
  );
}

export function Forbidden() {
  return (
    <CenteredCard icon={<Lock />} title="403 — Admins only">
      <p>Your account doesn&apos;t have access to the Quick Chat admin dashboard. Roles can only be granted by a super admin.</p>
      <Link href="/home" className="inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink">
        Back to Quick Chat
      </Link>
    </CenteredCard>
  );
}

/** Shown when the session hasn't completed two-factor authentication (aal2). */
export function MfaRequired({ onRetry }: { onRetry?: () => void }) {
  const [hasFactor, setHasFactor] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    getSupabaseBrowserClient()
      .auth.mfa.getAuthenticatorAssuranceLevel()
      .then(({ data }) => {
        if (alive) setHasFactor(data?.nextLevel === "aal2");
      })
      .catch(() => alive && setHasFactor(false));
    return () => {
      alive = false;
    };
  }, []);
  const verify = (
    <Link href="/login/mfa?next=/admin" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink">
      <ShieldCheck className="h-4 w-4" aria-hidden /> Verify with your authenticator
    </Link>
  );
  const enroll = (
    <Link
      href="/settings/security?mfa=required&next=/admin"
      className={
        hasFactor
          ? "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-ink hover:bg-surface-2"
          : "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink"
      }
    >
      <KeyRound className="h-4 w-4" aria-hidden /> Set up two-factor authentication
    </Link>
  );
  return (
    <CenteredCard icon={<ShieldAlert />} title="Two-factor authentication required">
      <p>
        Administrators must verify with an authenticator app before using the dashboard.
        {hasFactor === true ? " Your account has a factor enrolled — verify it to continue." : null}
        {hasFactor === false ? " Enroll an authenticator app first, then come back here." : null}
      </p>
      <div className="flex flex-col gap-2">
        {hasFactor ? (
          <>
            {verify}
            {enroll}
          </>
        ) : (
          <>
            {enroll}
            {verify}
          </>
        )}
        <Button variant="ghost" onClick={() => (onRetry ? onRetry() : window.location.reload())}>
          I&apos;ve verified — check again
        </Button>
      </div>
      <p className="rounded-2xl bg-surface-2 p-3 text-left text-xs">
        For local development only, setting <code className="font-mono">ADMIN_REQUIRE_MFA=false</code> on the server disables this
        requirement. Never disable it in production.
      </p>
    </CenteredCard>
  );
}

function FullPageSpinner() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg">
      <LogoMark className="h-12 w-12" />
      <Spinner label="Checking admin access" />
    </main>
  );
}

/**
 * Cosmetic gate: the server enforces roles + MFA on every /api/admin route.
 * The role shown here comes from GET /api/admin/me, never from client state.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  const queryClient = useQueryClient();
  const [mfaLost, setMfaLost] = useState(false);

  const query = useQuery({
    queryKey: adminKeys.me,
    queryFn: () => api.get<AdminMe>("/api/admin/me"),
    enabled: Boolean(me?.adminRole),
    retry: false,
    staleTime: 5 * 60_000,
    meta: { silent: true },
  });

  // Any admin API call that reports mfa_required (e.g. the session dropped to aal1) flips the gate.
  useEffect(() => {
    const unsubQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && isMfaError(event.query.state.error)) setMfaLost(true);
    });
    const unsubMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && isMfaError(event.mutation?.state.error)) setMfaLost(true);
    });
    return () => {
      unsubQueries();
      unsubMutations();
    };
  }, [queryClient]);

  const retry = () => {
    setMfaLost(false);
    void queryClient.invalidateQueries({ queryKey: adminKeys.all });
  };

  if (loading) return <FullPageSpinner />;
  if (!me) {
    return (
      <CenteredCard icon={<Lock />} title="Please sign in">
        <p>Sign in with an administrator account to continue.</p>
        <Link href="/login?next=/admin" className="inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-ink">
          Sign in
        </Link>
      </CenteredCard>
    );
  }
  if (!me.adminRole) return <Forbidden />;
  if (mfaLost || isMfaError(query.error)) return <MfaRequired onRetry={retry} />;
  if (query.error) {
    if (query.error instanceof ClientApiError && query.error.code === "forbidden") return <Forbidden />;
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg">
        <ErrorState description={query.error.message} onRetry={() => void query.refetch()} />
      </main>
    );
  }
  if (!query.data) return <FullPageSpinner />;
  return <AdminContext.Provider value={query.data}>{children}</AdminContext.Provider>;
}

/** Renders children only for roles at or above `min`; otherwise explains why. */
export function RequireRole({ min, children }: { min: AdminRole; children: ReactNode }) {
  const { role } = useAdmin();
  if (hasRole(role, min)) return <>{children}</>;
  return (
    <div className="mx-auto mt-10 max-w-md rounded-3xl border border-border bg-surface p-6 text-center">
      <Lock className="mx-auto h-8 w-8 text-muted" aria-hidden />
      <h1 className="mt-3 font-display text-lg font-bold">Requires {ROLE_LABEL[min]} access</h1>
      <p className="mt-1 text-sm text-muted">Your role ({ROLE_LABEL[role]}) can&apos;t open this section.</p>
    </div>
  );
}
