import { Suspense } from "react";
import { VerifyEmail } from "@/components/auth/recovery-forms";
import { AuthFallback } from "@/components/auth/auth-fallback";

export const metadata = { title: "Verify your email" };

export default function Page() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <VerifyEmail />
    </Suspense>
  );
}
