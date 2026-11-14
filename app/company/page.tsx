import { Suspense } from "react";
import CompanyView from "@/components/CompanyView";

export const metadata = { title: "Company card · KYI" };

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 pt-10 text-sm text-muted">Loading company…</div>}>
      <CompanyView />
    </Suspense>
  );
}
