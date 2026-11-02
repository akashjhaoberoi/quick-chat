import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminServerGuard } from "@/components/admin/server-guard";
import { Spinner } from "@/components/ui/feedback";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <Spinner label="Loading admin dashboard" />
    </div>
  );
}

/**
 * Separate, protected admin area (not inside the (app) shell). The guard reads
 * the session on the server, so it streams behind <Suspense>; every
 * /api/admin route re-checks role + MFA independently.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <AdminServerGuard>
        <AdminShell>{children}</AdminShell>
      </AdminServerGuard>
    </Suspense>
  );
}
