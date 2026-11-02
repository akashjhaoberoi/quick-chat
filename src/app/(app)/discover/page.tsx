import { Suspense } from "react";
import { DiscoverView } from "@/components/discover/discover-view";
import { Spinner } from "@/components/ui/feedback";

export default function DiscoverPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-10"><Spinner /></div>}>
      <DiscoverView />
    </Suspense>
  );
}
