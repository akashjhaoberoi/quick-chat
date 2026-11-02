import { Suspense } from "react";
import { ListSkeleton } from "@/components/ui/feedback";
import { SearchView } from "@/components/search/search-view";

export default function SearchPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={6} />}>
      <SearchView />
    </Suspense>
  );
}
