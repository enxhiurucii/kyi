import { Suspense } from "react";
import MarketView from "@/components/MarketView";

export const metadata = { title: "Market Radar · KYI" };

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 pt-10 text-sm text-muted">Loading radar…</div>}>
      <MarketView />
    </Suspense>
  );
}
