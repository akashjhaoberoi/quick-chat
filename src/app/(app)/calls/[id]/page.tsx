import { Suspense } from "react";
import { CallScreen } from "@/components/calls/call-screen";
import { Spinner } from "@/components/ui/feedback";

export default function CallPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#08070f] md:relative md:h-dvh">
          <Spinner label="Loading call" />
        </div>
      }
    >
      <CallScreen />
    </Suspense>
  );
}
