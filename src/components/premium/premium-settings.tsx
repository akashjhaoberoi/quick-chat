"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Crown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { useMe } from "@/components/providers/session-provider";
import { SettingsPageHeader } from "@/components/settings/settings-shell";
import { SettingsSection } from "@/components/settings/settings-ui";
import { api, errorMessage } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { formatInr, PROFILE_THEMES, THEME_GRADIENTS, type ProfileTheme } from "@/lib/premium-plans";
import { cn } from "@/lib/utils";
import { currentSubscription, PREMIUM_KEY, usePremium, type PremiumTransaction } from "./use-premium";

const PLAN_NAME = { monthly: "Monthly", yearly: "Yearly", lifetime: "Lifetime" } as const;
const day = (iso: string | null) => (iso ? format(new Date(iso), "d MMM yyyy") : "—");

const TX_LABEL: Record<PremiumTransaction["status"], string> = {
  authorized: "Processing",
  captured: "Paid",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
};

/** Settings → Premium: plan, dates, payment history, cancel/upgrade, profile theme. */
export function PremiumSettings() {
  const premium = usePremium();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const me = useMe();
  const router = useRouter();
  const sub = currentSubscription(premium.data);
  const themes = premium.data?.entitlements.includes("profile_themes") ?? false;
  const currentTheme = ((me.profile as { profile_theme?: ProfileTheme }).profile_theme ?? "default") as ProfileTheme;

  const cancel = useMutation({
    mutationFn: () => api.post<{ accessUntil: string | null }>("/api/premium/cancel"),
    onSuccess: (r) => {
      toast.success(`Renewal cancelled. Premium stays on until ${day(r.accessUntil)}.`);
      void qc.invalidateQueries({ queryKey: PREMIUM_KEY });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const theme = useMutation({
    mutationFn: (t: ProfileTheme) => api.post("/api/premium/theme", { theme: t }),
    onSuccess: () => {
      toast.success("Profile theme updated");
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: qk.profile(me.profile.username) });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="space-y-4 px-4 pb-10 md:px-0">
      <SettingsPageHeader title="Premium" description="Your Quick Chat Premium plan and payments." />

      <SettingsSection title="Your plan">
        {premium.isPending ? (
          <ListSkeleton rows={2} />
        ) : premium.isError ? (
          <ErrorState onRetry={() => void premium.refetch()} />
        ) : sub ? (
          <div className="space-y-3" data-testid="premium-status">
            <p className="flex items-center gap-2 font-display text-lg font-bold">
              <Crown className="h-5 w-5 text-brand" /> Premium {PLAN_NAME[sub.plan_id]}
            </p>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted">Status</dt>
                <dd className="font-semibold">
                  {sub.plan_id === "lifetime"
                    ? "Lifetime member — no renewals"
                    : sub.status === "cancelled"
                      ? "Cancelled — won't renew"
                      : sub.status === "halted"
                        ? "Renewal payment failed — update your payment method"
                        : "Active"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Started</dt>
                <dd className="font-semibold">{day(sub.started_at ?? sub.created_at)}</dd>
              </div>
              {sub.plan_id !== "lifetime" ? (
                <div>
                  <dt className="text-xs text-muted">{sub.status === "active" ? "Next renewal" : "Premium ends"}</dt>
                  <dd className="font-semibold">{day(sub.access_until)}</dd>
                </div>
              ) : null}
            </dl>
            <div className="flex flex-wrap gap-2">
              {sub.plan_id !== "lifetime" ? (
                <Button variant="outline" size="sm" onClick={() => router.push("/premium")}>
                  Upgrade to Lifetime
                </Button>
              ) : null}
              {sub.recurring && sub.status === "active" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={cancel.isPending}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Cancel renewal?",
                        description: `You won't be charged again. Premium stays on until ${day(sub.access_until)}.`,
                        confirmLabel: "Cancel renewal",
                        danger: true,
                      })
                    )
                      cancel.mutate();
                  }}
                >
                  Cancel renewal
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">You&apos;re on the free plan. Premium adds a badge, profile themes, profile analytics, bigger uploads and extra call effects.</p>
            <Button variant="gradient" onClick={() => router.push("/premium")}>
              <Crown className="h-4 w-4" /> See Premium plans
            </Button>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Profile theme" description={themes ? "Colour of your profile header." : "Premium members can choose a profile header theme."}>
        <div role="radiogroup" aria-label="Profile theme" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {PROFILE_THEMES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={currentTheme === t}
              disabled={(!themes && t !== "default") || theme.isPending}
              onClick={() => theme.mutate(t)}
              className={cn(
                "rounded-2xl border p-1 text-xs font-semibold capitalize disabled:opacity-40",
                currentTheme === t ? "border-brand ring-4 ring-[var(--ring)]" : "border-border",
              )}
            >
              <span className="block h-10 rounded-xl" style={{ background: THEME_GRADIENTS[t] }} />
              <span className="mt-1 block">{t}</span>
            </button>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title="Payment history">
        {premium.data?.transactions.length ? (
          <ul className="divide-y divide-border" data-testid="transactions">
            {premium.data.transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold">
                    {PLAN_NAME[t.plan_id]} · {formatInr(t.amount_paise)}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {format(new Date(t.created_at), "d MMM yyyy, HH:mm")}
                    {t.method ? ` · ${t.method.toUpperCase()}` : ""}
                    {t.razorpay_payment_id ? ` · ${t.razorpay_payment_id}` : ""}
                    {t.status === "failed" && t.error_description ? ` · ${t.error_description}` : ""}
                  </span>
                </span>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", t.status === "captured" ? "bg-brand-soft text-ink" : "bg-surface-2 text-ink-2")}>
                  {TX_LABEL[t.status]}
                </span>
              </li>
            ))}
          </ul>
        ) : premium.isPending ? null : (
          <EmptyState icon={<Crown />} title="No payments yet" description="Your Premium payments will appear here." />
        )}
      </SettingsSection>
    </div>
  );
}
