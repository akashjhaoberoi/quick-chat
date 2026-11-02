import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/auth/recovery-forms";
import { AuthFallback } from "@/components/auth/auth-fallback";

export const metadata = { title: "Choose a new password" };

export default function Page() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
