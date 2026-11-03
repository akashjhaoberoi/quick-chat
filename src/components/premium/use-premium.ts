"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { Entitlement, PlanId } from "@/lib/premium-plans";

export type PremiumSubscription = {
  id: string;
  plan_id: PlanId;
  status: "active" | "cancelled" | "halted" | "expired" | "refunded";
  started_at: string | null;
  current_period_end: string | null;
  access_until: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  created_at: string;
  recurring: boolean;
};

export type PremiumTransaction = {
  id: string;
  plan_id: PlanId;
  amount_paise: number;
  currency: string;
  status: "authorized" | "captured" | "failed" | "cancelled" | "refunded" | "partially_refunded";
  method: string | null;
  razorpay_payment_id: string | null;
  error_description: string | null;
  refunded_paise: number;
  created_at: string;
};

export type PremiumState = {
  configured: boolean;
  available: boolean;
  plans: { id: PlanId; name: string; amount_paise: number; currency: string; billing_interval: string }[];
  subscriptions: PremiumSubscription[];
  transactions: PremiumTransaction[];
  entitlements: Entitlement[];
};

export const PREMIUM_KEY = ["premium"] as const;

/** Premium status from the server. Entitlements are decided by the database, never locally. */
export function usePremium() {
  return useQuery({ queryKey: PREMIUM_KEY, queryFn: () => api.get<PremiumState>("/api/premium"), staleTime: 60_000 });
}

export function useEntitlement(key: Entitlement): boolean {
  return usePremium().data?.entitlements.includes(key) ?? false;
}

/** The subscription that currently grants access (lifetime first), if any. */
export function currentSubscription(state: PremiumState | undefined): PremiumSubscription | null {
  if (!state) return null;
  const now = Date.now();
  const live = state.subscriptions.filter(
    (s) => (s.plan_id === "lifetime" && s.status === "active") || (["active", "cancelled", "halted"].includes(s.status) && s.access_until && Date.parse(s.access_until) > now),
  );
  return live.find((s) => s.plan_id === "lifetime") ?? live[0] ?? null;
}
