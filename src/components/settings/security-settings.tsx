"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { KeyRound, LogOut, Monitor, ShieldAlert, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Factor } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/controls";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, ListSkeleton, Spinner } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/input";
import { useMe } from "@/components/providers/session-provider";
import { FormAlert } from "@/components/auth/auth-bits";
import { authErrorMessage, safeNext } from "@/components/auth/auth-utils";
import { PasswordInput, PasswordStrengthMeter } from "@/components/auth/password-input";
import { api } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { passwordSchema } from "@/lib/validation";
import { SettingsPageHeader } from "./settings-shell";
import { SettingsSection } from "./settings-ui";

type SecurityEvent = "mfa_enabled" | "mfa_disabled" | "password_changed" | "session_revoked";
const record = (event: SecurityEvent) => api.post("/api/auth/security-event", { event }).catch(() => undefined);

function useMfa() {
  return useQuery({
    queryKey: ["mfa"],
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient();
      const [factors, aal] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
      if (factors.error) throw factors.error;
      return { all: factors.data.all, totp: factors.data.totp ?? [], aal: aal.data?.currentLevel ?? null };
    },
  });
}

function EnrollDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [enrollment, setEnrollment] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  async function start() {
    setStarted(true);
    setError(null);
    const supabase = getSupabaseBrowserClient();
    // Remove abandoned, never-verified enrollments first (they block new ones).
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const f of existing?.all ?? []) {
      if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
    if (err || !data) {
      setError(authErrorMessage(err));
      return;
    }
    setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function close() {
    if (enrollment) await getSupabaseBrowserClient().auth.mfa.unenroll({ factorId: enrollment.id }).catch(() => undefined);
    setEnrollment(null);
    setStarted(false);
    setCode("");
    setError(null);
    onClose();
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!enrollment) return;
    const clean = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(clean)) return setError("Enter the 6-digit code from your app.");
    setBusy(true);
    setError(null);
    const { error: err } = await getSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId: enrollment.id, code: clean });
    setBusy(false);
    if (err) return setError(authErrorMessage(err));
    await record("mfa_enabled");
    toast.success("Two-factor authentication is on");
    setEnrollment(null);
    setStarted(false);
    setCode("");
    onDone();
  }

  return (
    <Dialog open={open} onClose={() => void close()} variant="sheet" title="Set up two-factor authentication" description="Use an authenticator app such as Google Authenticator, 1Password, Authy or Microsoft Authenticator.">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {!enrollment ? (
        !started || error ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-2">
              After setup, signing in will ask for a 6-digit code from your app in addition to your password. Consider adding a second authenticator as a
              backup so losing a phone doesn&apos;t lock you out.
            </p>
            <Button variant="gradient" className="w-full" onClick={() => void start()}>
              {error ? "Try again" : "Show QR code"}
            </Button>
          </div>
        ) : (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-2">
            <li>Scan this QR code with your authenticator app.</li>
            <li>Enter the 6-digit code it shows.</li>
          </ol>
          <div className="flex justify-center">
            {/* QR code is an SVG data URL generated by Supabase Auth. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrollment.qr} alt="QR code for your authenticator app" className="h-48 w-48 rounded-2xl bg-white p-2" />
          </div>
          <div className="rounded-2xl bg-surface-2 p-3 text-center">
            <p className="text-xs text-muted">Can&apos;t scan? Enter this key manually:</p>
            <code className="mt-1 block select-all break-all font-mono text-sm font-semibold">{enrollment.secret}</code>
          </div>
          <Field label="Verification code">
            {(p) => (
              <Input
                {...p}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, "").slice(0, 7))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="text-center font-display text-xl tracking-[0.4em]"
              />
            )}
          </Field>
          <Button type="submit" variant="gradient" className="w-full" loading={busy}>
            Verify and turn on
          </Button>
        </form>
      )}
    </Dialog>
  );
}

function TwoFactorSection() {
  const router = useRouter();
  const params = useSearchParams();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const mfa = useMfa();
  const [enrolling, setEnrolling] = useState(false);
  const required = params.get("mfa") === "required";
  const next = safeNext(params.get("next"), "");
  const verified = (mfa.data?.totp ?? []).filter((f) => f.status === "verified");

  async function remove(f: Factor) {
    const ok = await confirm({
      title: "Remove this authenticator?",
      description: verified.length === 1 ? "Two-factor authentication will be turned off and your account will be protected by your password only." : undefined,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    const { error } = await getSupabaseBrowserClient().auth.mfa.unenroll({ factorId: f.id });
    if (error) {
      if (error.code === "insufficient_aal" || /aal2/i.test(error.message)) {
        router.push(`/login/mfa?next=${encodeURIComponent("/settings/security")}`);
        return;
      }
      toast.error(authErrorMessage(error));
      return;
    }
    await record("mfa_disabled");
    toast.success("Authenticator removed");
    await queryClient.invalidateQueries({ queryKey: ["mfa"] });
  }

  return (
    <SettingsSection title="Two-factor authentication" description="Require a code from your authenticator app when signing in.">
      {required ? (
        <FormAlert tone="info">
          Administrator access requires two-factor authentication.{" "}
          {verified.length ? (
            <Link href={`/login/mfa?next=${encodeURIComponent(next || "/admin")}`} className="font-bold underline">
              Verify now
            </Link>
          ) : (
            "Turn it on below to continue."
          )}
        </FormAlert>
      ) : null}
      {mfa.isPending ? (
        <ListSkeleton rows={1} />
      ) : mfa.isError ? (
        <ErrorState onRetry={() => void mfa.refetch()} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold">
              {verified.length ? <ShieldCheck className="h-5 w-5 text-success" /> : <ShieldAlert className="h-5 w-5 text-warning" />}
              {verified.length ? <Badge tone="success">On</Badge> : <Badge tone="warning">Off</Badge>}
              {verified.length && mfa.data.aal !== "aal2" ? <span className="text-xs font-medium text-muted">(not verified in this session)</span> : null}
            </span>
            <Button variant={verified.length ? "outline" : "gradient"} size="sm" onClick={() => setEnrolling(true)}>
              {verified.length ? "Add another authenticator" : "Turn on"}
            </Button>
          </div>
          {verified.length ? (
            <ul className="divide-y divide-border rounded-2xl border border-border">
              {verified.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Smartphone className="h-4 w-4 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{f.friendly_name || "Authenticator app"}</span>
                    <span className="block text-xs text-muted">Added {format(new Date(f.created_at), "d MMM yyyy")}</span>
                  </span>
                  <Button variant="ghost" size="icon-sm" aria-label="Remove authenticator" onClick={() => void remove(f)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      <EnrollDialog
        open={enrolling}
        onClose={() => setEnrolling(false)}
        onDone={async () => {
          setEnrolling(false);
          await queryClient.invalidateQueries({ queryKey: ["mfa"] });
          if (required && next) router.push(next);
        }}
      />
    </SettingsSection>
  );
}

function PasswordSection() {
  const me = useMe();
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [nonce, setNonce] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const fe: typeof errors = {};
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) fe.password = parsed.error.issues[0]?.message;
    if (password !== confirmPw) fe.confirm = "Passwords don't match";
    setErrors(fe);
    if (fe.password || fe.confirm) return;
    setBusy(true);
    setFormError(null);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser(nonce ? { password, nonce: nonce.trim() } : { password });
    if (error) {
      setBusy(false);
      if (error.code === "reauthentication_needed" || /reauthenticat/i.test(error.message)) {
        const { error: reErr } = await supabase.auth.reauthenticate();
        if (reErr) return setFormError(authErrorMessage(reErr));
        setNonce("");
        return setFormError(null);
      }
      if (error.code === "insufficient_aal") return setFormError("Verify with your authenticator app first (sign out and back in), then try again.");
      return setFormError(authErrorMessage(error));
    }
    await record("password_changed");
    setBusy(false);
    setPassword("");
    setConfirmPw("");
    setNonce(null);
    toast.success("Password changed");
  }

  return (
    <SettingsSection title="Change password" description="Use at least 10 characters with letters and a number.">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      {nonce !== null ? <FormAlert tone="info">For your security we emailed a verification code to {me.user.email}. Enter it below.</FormAlert> : null}
      <form onSubmit={submit} className="space-y-4" noValidate>
        <input type="email" autoComplete="username" value={me.user.email ?? ""} readOnly hidden />
        <Field label="New password" error={errors.password}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        {password ? <PasswordStrengthMeter password={password} context={[me.profile.username, me.profile.display_name]} /> : null}
        <Field label="Confirm new password" error={errors.confirm}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />}
        </Field>
        {nonce !== null ? (
          <Field label="Verification code from email">
            {(p) => <Input {...p} value={nonce} onChange={(e) => setNonce(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />}
          </Field>
        ) : null}
        <Button type="submit" variant="primary" loading={busy}>
          <KeyRound className="h-4 w-4" /> Update password
        </Button>
      </form>
    </SettingsSection>
  );
}

const EVENT_LABELS: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  signup: "Account created",
  password_changed: "Password changed",
  password_reset: "Password reset",
  mfa_enabled: "Two-factor turned on",
  mfa_disabled: "Two-factor turned off",
  session_revoked: "Signed out other devices",
  account_deactivated: "Account deactivated",
  account_reactivated: "Account reactivated",
  email_changed: "Email changed",
};

type ActivityRow = { id: string; session_id: string | null; event: string; ip: string | null; device: string | null; created_at: string };

function ActivitySection() {
  const me = useMe();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const activity = useQuery({
    queryKey: ["login-activity"],
    queryFn: async () => {
      const supabase = getSupabaseBrowserClient();
      const [{ data, error }, claims] = await Promise.all([
        supabase.from("user_sessions").select("id, session_id, event, ip, device, created_at").eq("user_id", me.user.id).order("created_at", { ascending: false }).limit(50),
        supabase.auth.getClaims(),
      ]);
      if (error) throw error;
      const current = (claims.data?.claims as { session_id?: string } | undefined)?.session_id ?? null;
      return { rows: (data ?? []) as ActivityRow[], current };
    },
  });

  async function signOutOthers() {
    const ok = await confirm({
      title: "Sign out of all other devices?",
      description: "Other browsers and devices will be signed out. Access already granted to them can last until their current session token expires (up to about an hour).",
      confirmLabel: "Sign out others",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().auth.signOut({ scope: "others" });
    setBusy(false);
    if (error) return toast.error(authErrorMessage(error));
    await record("session_revoked");
    toast.success("Signed out of all other devices");
    await queryClient.invalidateQueries({ queryKey: ["login-activity"] });
  }

  return (
    <SettingsSection title="Login activity" description="Recent sign-ins and security changes on your account. If something looks unfamiliar, change your password and sign out other devices.">
      <Button variant="outline" size="sm" loading={busy} onClick={() => void signOutOthers()} className="mb-3">
        <LogOut className="h-4 w-4" /> Sign out of all other devices
      </Button>
      {activity.isPending ? (
        <ListSkeleton rows={3} />
      ) : activity.isError ? (
        <ErrorState onRetry={() => void activity.refetch()} />
      ) : activity.data.rows.length === 0 ? (
        <EmptyState icon={<Monitor />} title="No activity recorded yet" />
      ) : (
        <ul className="divide-y divide-border">
          {activity.data.rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
                {/iPhone|Android|iPad/.test(r.device ?? "") ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {EVENT_LABELS[r.event] ?? r.event}
                  {r.event === "login" && r.session_id && r.session_id === activity.data.current ? <Badge tone="success">This device</Badge> : null}
                </span>
                <span className="block truncate text-xs text-muted">
                  {r.device ?? "Unknown device"}
                  {r.ip ? ` · ${r.ip}` : ""} · {format(new Date(r.created_at), "d MMM yyyy, HH:mm")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}

export function SecuritySettings() {
  return (
    <div className="space-y-4 px-4 pb-10 md:px-0">
      <SettingsPageHeader title="Security" description="Protect your account and review where you're signed in." />
      <TwoFactorSection />
      <PasswordSection />
      <ActivitySection />
    </div>
  );
}
