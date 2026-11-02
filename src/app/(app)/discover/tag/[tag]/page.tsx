import { Suspense } from "react";
import { TagView } from "@/components/discover/post-views";
import { Spinner } from "@/components/ui/feedback";

export default function TagPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-10"><Spinner /></div>}>
      <TagView />
    </Suspense>
  );
}
