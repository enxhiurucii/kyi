import { Suspense } from "react";
import HomeView from "@/components/HomeView";

export const metadata = { title: "Raise · Find investors · KYI" };

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 pt-10 text-sm text-muted">Loading…</div>}>
      <HomeView />
    </Suspense>
  );
}
