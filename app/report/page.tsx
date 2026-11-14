import { Suspense } from "react";
import ReportView, { ReportSkeleton } from "@/components/ReportView";

export const metadata = { title: "Investor report card · KYI" };

export default function Page() {
  return (
    <Suspense fallback={<ReportSkeleton />}>
      <ReportView />
    </Suspense>
  );
}
