"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api/client";
import { formatInr } from "@/lib/premium-plans";
import { AdminPageHeader, DataTable, Panel, Select, StatCard, StatCardSkeleton, TableSkeleton, td, TimeCell } from "./ui";

type Stats = {
  premium_users: number;
  monthly: number;
  yearly: number;
  lifetime: number;
  cancelled: number;
  revenue_paise: number;
  successful: number;
  failed: number;
  refunded: number;
};
type Tx = {
  id: string;
  user_id: string;
  plan_id: string;
  amount_paise: number;
  status: string;
  method: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  refunded_paise: number;
  error_description: string | null;
  created_at: string;
  profile: { username: string } | null;
};
type Sub = {
  id: string;
  user_id: string;
  plan_id: string;
  status: string;
  access_until: string | null;
  cancel_at_period_end: boolean;
  granted_by: string | null;
  created_at: string;
  profile: { username: string } | null;
};
type Data = { configured: boolean; stats: Stats; transactions: Tx[]; subscriptions: Sub[] };

const KEY = ["admin", "premium"] as const;

/** Admin → Premium: counters, transactions, subscriptions, reconciliation and complimentary access. */
export function PremiumAdmin() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const data = useQuery({ queryKey: [...KEY, status], queryFn: () => api.get<Data>("/api/admin/premium", status ? { status } : undefined) });
  const [paymentId, setPaymentId] = useState("");
  const [userId, setUserId] = useState("");
  const [reason, setReason] = useState("");

  const reconcile = useMutation({
    mutationFn: () => api.post<{ status: string; activated: boolean }>("/api/admin/premium/reconcile", { paymentId: paymentId.trim() }),
    onSuccess: (r) => {
      toast.success(`Payment status: ${r.status}${r.activated ? " — Premium active" : ""}`);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const grant = useMutation({
    mutationFn: (g: boolean) => api.post("/api/admin/premium/grant", { userId: userId.trim(), grant: g, reason: reason.trim() }),
    onSuccess: (_d, g) => {
      toast.success(g ? "Complimentary Premium granted" : "Premium revoked");
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const s = data.data?.stats;
  return (
    <div>
      <AdminPageHeader
        title="Premium"
        description={data.data && !data.data.configured ? "Razorpay isn't configured on this server — checkout is disabled." : "Subscriptions, payments and entitlements."}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {s ? (
          <>
            <StatCard label="Premium users" value={s.premium_users} />
            <StatCard label="Monthly" value={s.monthly} />
            <StatCard label="Yearly" value={s.yearly} />
            <StatCard label="Lifetime" value={s.lifetime} />
            <StatCard label="Revenue (net of refunds)" value={formatInr(s.revenue_paise)} />
            <StatCard label="Successful payments" value={s.successful} />
            <StatCard label="Failed payments" value={s.failed} tone={s.failed ? "warning" : undefined} />
            <StatCard label="Cancelled / refunded" value={`${s.cancelled} / ${s.refunded}`} />
          </>
        ) : (
          Array.from({ length: 8 }, (_, i) => <StatCardSkeleton key={i} />)
        )}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Reconcile a payment" description="Fetches the payment from Razorpay and applies its real status (activation, failure or refund).">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              reconcile.mutate();
            }}
          >
            <Input aria-label="Razorpay payment ID" placeholder="pay_…" value={paymentId} onChange={(e) => setPaymentId(e.target.value)} />
            <Button type="submit" loading={reconcile.isPending} disabled={!/^pay_\w+$/.test(paymentId.trim())}>
              Reconcile
            </Button>
          </form>
        </Panel>
        <Panel title="Complimentary Premium" description="Grant lifetime access without payment, or revoke all current access. Audited.">
          <div className="space-y-2">
            <Input aria-label="User ID" placeholder="User ID (uuid)" value={userId} onChange={(e) => setUserId(e.target.value)} />
            <Input aria-label="Reason" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <div className="flex gap-2">
              <Button loading={grant.isPending && grant.variables === true} disabled={!userId.trim() || reason.trim().length < 3} onClick={() => grant.mutate(true)}>
                Grant
              </Button>
              <Button variant="danger" loading={grant.isPending && grant.variables === false} disabled={!userId.trim() || reason.trim().length < 3} onClick={() => grant.mutate(false)}>
                Revoke
              </Button>
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        className="mt-6"
        title="Transactions"
        bodyClassName="p-0"
        actions={
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="captured">Paid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
            <option value="partially_refunded">Partly refunded</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        }
      >
        {data.isPending ? (
          <TableSkeleton />
        ) : (
          <DataTable caption="Premium transactions" head={["When", "User", "Plan", "Amount", "Status", "Method", "Payment ID"]}>
            {(data.data?.transactions ?? []).map((t) => (
              <tr key={t.id}>
                <td className={td}>
                  <TimeCell iso={t.created_at} />
                </td>
                <td className={td}>@{t.profile?.username ?? t.user_id.slice(0, 8)}</td>
                <td className={td}>{t.plan_id}</td>
                <td className={td}>
                  {formatInr(t.amount_paise)}
                  {t.refunded_paise ? ` (−${formatInr(t.refunded_paise)})` : ""}
                </td>
                <td className={td} title={t.error_description ?? undefined}>
                  {t.status}
                </td>
                <td className={td}>{t.method ?? "—"}</td>
                <td className={`${td} font-mono text-xs`}>{t.razorpay_payment_id ?? t.razorpay_order_id ?? "—"}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>

      <Panel className="mt-6" title="Subscriptions" bodyClassName="p-0">
        {data.isPending ? (
          <TableSkeleton />
        ) : (
          <DataTable caption="Premium subscriptions" head={["Created", "User", "Plan", "Status", "Access until", "Source"]}>
            {(data.data?.subscriptions ?? []).map((s2) => (
              <tr key={s2.id}>
                <td className={td}>
                  <TimeCell iso={s2.created_at} />
                </td>
                <td className={td}>@{s2.profile?.username ?? s2.user_id.slice(0, 8)}</td>
                <td className={td}>{s2.plan_id}</td>
                <td className={td}>
                  {s2.status}
                  {s2.cancel_at_period_end ? " (no renewal)" : ""}
                </td>
                <td className={td}>{s2.plan_id === "lifetime" && s2.status === "active" ? "Lifetime" : <TimeCell iso={s2.access_until} />}</td>
                <td className={td}>{s2.granted_by ? "Complimentary" : "Paid"}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
    </div>
  );
}
