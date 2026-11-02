import { Suspense } from "react";
import { StoryViewer } from "@/components/stories/story-viewer";

export default function StoryViewerPage() {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[80] bg-black" />}>
      <StoryViewer />
    </Suspense>
  );
}
