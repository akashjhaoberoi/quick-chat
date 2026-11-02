import { Suspense } from "react";
import { ListSkeleton } from "@/components/ui/feedback";
import { SnapsView } from "@/components/snaps/snaps-view";

export default function SnapsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <SnapsView />
    </Suspense>
  );
}
