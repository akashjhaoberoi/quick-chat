import { RequireRole } from "@/components/admin/admin-gate";
import { AuditLogView } from "@/components/admin/audit-system";

export const metadata = { title: "Audit log · Admin" };

export default function AdminAuditPage() {
  return (
    <RequireRole min="admin">
      <AuditLogView />
    </RequireRole>
  );
}
