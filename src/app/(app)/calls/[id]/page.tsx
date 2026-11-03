import { Suspense } from "react";
import { PremiumCallScreen } from "@/components/calls/premium-call-screen";
import { Spinner } from "@/components/ui/feedback";

export default function CallPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#16110C] md:relative md:h-dvh">
          <Spinner label="Loading call" />
        </div>
      }
    >
      <PremiumCallScreen />
    </Suspense>
  );
}
