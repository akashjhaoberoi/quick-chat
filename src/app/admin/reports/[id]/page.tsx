import { Suspense } from "react";
import { ListSkeleton } from "@/components/ui/feedback";
import { ReportDetailView } from "@/components/admin/reports";

export const metadata = { title: "Report · Admin" };

export default function AdminReportPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <ReportDetailView />
    </Suspense>
  );
}
