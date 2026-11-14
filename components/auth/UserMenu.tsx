"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import { Chip, cx } from "@/components/ui";

export default function UserMenu() {
  const { ready, accountsEnabled, user, verifiedFounder, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!accountsEnabled || !ready) return null;

  if (!user) {
    return (
      <div className="flex items-center gap-1.5 text-sm">
        <Link href="/signin" className="rounded-lg px-2.5 py-1.5 text-muted transition hover:text-ink">
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-lg border border-line bg-white/5 px-2.5 py-1.5 text-ink transition hover:bg-white/10"
        >
          Sign up
        </Link>
      </div>
    );
  }

  const label = user.fullName || user.email || (user.isAnonymous ? "Guest" : "Account");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={cx(
          "inline-flex max-w-[10rem] items-center gap-1.5 truncate rounded-lg px-2.5 py-1.5 text-sm transition",
          open ? "bg-white/10 text-ink" : "text-muted hover:text-ink",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{label}</span>
        {verifiedFounder ? <Chip tone="good">Verified ✓</Chip> : null}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 min-w-[10.5rem] rounded-xl border border-line bg-[#0b0d13] py-1 shadow-xl"
        >
          <Link
            href="/profile"
            role="menuitem"
            className="block px-3 py-2 text-sm text-ink-2 hover:bg-white/5"
            onClick={() => setOpen(false)}
          >
            Profile
          </Link>
          <Link
            href="/profile#lists"
            role="menuitem"
            className="block px-3 py-2 text-sm text-ink-2 hover:bg-white/5"
            onClick={() => setOpen(false)}
          >
            Lists
          </Link>
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-ink-2 hover:bg-white/5"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
