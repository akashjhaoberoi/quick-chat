import { Suspense } from "react";
import { ListSkeleton } from "@/components/ui/feedback";
import { StoriesView } from "@/components/stories/stories-view";

export default function StoriesPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <StoriesView />
    </Suspense>
  );
}
