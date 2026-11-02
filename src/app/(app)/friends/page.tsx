import { Suspense } from "react";
import { ListSkeleton } from "@/components/ui/feedback";
import { FriendsView } from "@/components/friends/friends-view";

export default function FriendsPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={8} />}>
      <FriendsView />
    </Suspense>
  );
}
