import { Suspense } from "react";
import ProfileView from "@/components/profile/ProfileView";

export const metadata = { title: "Profile · KYI" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-xl px-4 py-16 text-sm text-muted">Loading…</div>}>
      <ProfileView />
    </Suspense>
  );
}
