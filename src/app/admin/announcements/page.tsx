import { RequireRole } from "@/components/admin/admin-gate";
import { AnnouncementsView } from "@/components/admin/settings-announcements";

export const metadata = { title: "Announcements · Admin" };

export default function AdminAnnouncementsPage() {
  return (
    <RequireRole min="admin">
      <AnnouncementsView />
    </RequireRole>
  );
}
