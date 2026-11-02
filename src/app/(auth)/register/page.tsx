import { Suspense } from "react";
import { RegisterForm } from "@/components/auth/register-form";
import { AuthFallback } from "@/components/auth/auth-fallback";

export const metadata = { title: "Create account" };

export default function Page() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <RegisterForm />
    </Suspense>
  );
}
