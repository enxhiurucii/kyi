import { redirect } from "next/navigation";

/** Legacy path — investor workspace lives at /invest. */
export default function Page() {
  redirect("/invest");
}
