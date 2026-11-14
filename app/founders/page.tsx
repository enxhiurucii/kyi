import { redirect } from "next/navigation";

/** Legacy path — founder workspace lives at /raise. */
export default function Page() {
  redirect("/raise");
}
