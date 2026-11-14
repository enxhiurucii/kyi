import { Suspense } from "react";
import { SignInView } from "@/components/auth/AuthForms";

export const metadata = { title: "Sign in · KYI" };

export default function Page() {
  return (
    <Suspense fallback={<div className="px-4 pt-10 text-sm text-muted">Loading…</div>}>
      <SignInView />
    </Suspense>
  );
}
