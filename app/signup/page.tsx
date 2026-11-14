import { Suspense } from "react";
import { SignUpView } from "@/components/auth/AuthForms";

export const metadata = { title: "Sign up · KYI" };

export default function Page() {
  return (
    <Suspense fallback={<div className="px-4 pt-10 text-sm text-muted">Loading…</div>}>
      <SignUpView />
    </Suspense>
  );
}
