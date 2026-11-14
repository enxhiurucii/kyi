import { Suspense } from "react";
import CompareView from "@/components/CompareView";
import { Skeleton } from "@/components/ui";

export const metadata = { title: "Compare investors · KYI" };

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-10"><Skeleton className="h-80" /></div>}>
      <CompareView />
    </Suspense>
  );
}
