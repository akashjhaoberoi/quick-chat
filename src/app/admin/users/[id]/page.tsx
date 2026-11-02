import { Suspense } from "react";
import { ListSkeleton } from "@/components/ui/feedback";
import { UserDetailView } from "@/components/admin/user-detail";

export const metadata = { title: "User · Admin" };

export default function AdminUserPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <UserDetailView />
    </Suspense>
  );
}
