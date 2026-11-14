import { Suspense } from "react";
import ScoutView from "@/components/ScoutView";

export const metadata = { title: "Scout · KYI" };

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 pt-10 text-sm text-muted">Loading scout…</div>}>
      <ScoutView />
    </Suspense>
  );
}
