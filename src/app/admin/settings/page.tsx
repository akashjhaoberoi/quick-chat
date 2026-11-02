import { RequireRole } from "@/components/admin/admin-gate";
import { SettingsView } from "@/components/admin/settings-announcements";

export const metadata = { title: "Settings · Admin" };

export default function AdminSettingsPage() {
  return (
    <RequireRole min="admin">
      <SettingsView />
    </RequireRole>
  );
}
