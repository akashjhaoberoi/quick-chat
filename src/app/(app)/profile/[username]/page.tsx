import { Suspense } from "react";
import { ProfileView } from "@/components/profile/profile-view";
import { ListSkeleton } from "@/components/ui/feedback";

export const metadata = { title: "Profile" };

export default function Page() {
  return (
    <Suspense fallback={<ListSkeleton rows={3} />}>
      <ProfileView />
    </Suspense>
  );
}
