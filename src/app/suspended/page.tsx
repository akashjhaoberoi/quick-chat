import { SuspendedView } from "@/components/auth/suspended-view";

export const metadata = { title: "Account restricted" };

export default function Page() {
  return <SuspendedView />;
}
