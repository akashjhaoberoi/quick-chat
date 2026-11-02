import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { AuthFallback } from "@/components/auth/auth-fallback";

export const metadata = { title: "Sign in" };

export default function Page() {
  return (
    <Suspense fallback={<AuthFallback />}>
      <LoginForm />
    </Suspense>
  );
}
