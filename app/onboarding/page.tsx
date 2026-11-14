import { Suspense } from "react";
import Onboarding from "@/components/profile/Onboarding";

export const metadata = { title: "Onboarding · KYI" };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl px-4 py-16 text-sm text-muted">Loading…</div>}>
      <Onboarding />
    </Suspense>
  );
}
