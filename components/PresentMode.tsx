"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { readPresentFlag, writePresentFlag } from "@/lib/present";

/** Syncs ?present=1 / P key / sessionStorage → <html data-present>. */
export default function PresentMode() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const fromQuery = sp.get("present") === "1";
    const on = fromQuery || readPresentFlag();
    writePresentFlag(on);
    document.documentElement.dataset.present = on ? "true" : "false";
    if (on && !fromQuery) {
      const next = new URLSearchParams(sp.toString());
      next.set("present", "1");
      router.replace(`${pathname}?${next}`, { scroll: false });
    }
  }, [sp, pathname, router]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "p" && e.key !== "P") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      const nextOn = document.documentElement.dataset.present !== "true";
      writePresentFlag(nextOn);
      document.documentElement.dataset.present = nextOn ? "true" : "false";
      const next = new URLSearchParams(window.location.search);
      if (nextOn) next.set("present", "1");
      else next.delete("present");
      const q = next.toString();
      router.replace(`${pathname}${q ? `?${q}` : ""}`, { scroll: false });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, router]);

  return null;
}
