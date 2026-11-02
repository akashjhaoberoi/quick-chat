import { Suspense } from "react";
import { MfaChallenge } from "@/components/auth/mfa-challenge";
import { AuthFallback } from "@/components/auth/auth-fallback";

export const metadata = { title: "Two-factor verification" };

export default function Page() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <MfaChallenge />
    </Suspense>
  );
}
