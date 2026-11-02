import { Suspense } from "react";
import { PostView } from "@/components/discover/post-views";
import { Spinner } from "@/components/ui/feedback";

export default function PostPage() {
  return (
    <Suspense fallback={<div className="flex justify-center p-10"><Spinner /></div>}>
      <PostView />
    </Suspense>
  );
}
