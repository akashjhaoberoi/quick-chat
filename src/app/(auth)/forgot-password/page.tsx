import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/auth/recovery-forms";
import { AuthFallback } from "@/components/auth/auth-fallback";

export const metadata = { title: "Reset password" };

export default function Page() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
