"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { profileStore, subscribeProfile } from "@/lib/profileStore";
import type { UserRole } from "@/lib/profiles/types";
import { Chip, cx } from "./ui";

export default function AppNav() {
  const pathname = usePathname();
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    const sync = () => {
      const r = profileStore.getRoles();
      setRoles(r);
      setHasProfile(Boolean(profileStore.getFounder() || profileStore.getCompany() || profileStore.getInvestor() || r.length));
    };
    sync();
    return subscribeProfile(sync);
  }, []);

  const isInvestor = roles.includes("investor");
  const roleLabel =
    roles.includes("founder") && roles.includes("investor")
      ? "Founder + Investor"
      : roles.includes("investor")
        ? "Investor"
        : roles.includes("founder")
          ? "Founder"
          : null;

  const links = [
    { href: "/raise", label: "Raise", match: "/raise" },
    { href: "/invest", label: "Invest", match: "/invest" },
    ...(isInvestor ? [{ href: "/watchlist", label: "Watchlist", match: "/watchlist" }] : []),
  ];

  return (
    <nav className="flex max-w-[min(100%,14rem)] items-center gap-0.5 overflow-x-auto text-sm text-muted sm:max-w-none sm:gap-2" aria-label="Primary">
      {links.map((l) => {
        const active = pathname === l.match || pathname.startsWith(`${l.match}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cx(
              "shrink-0 rounded-lg px-2 py-1.5 transition sm:px-3",
              active ? "bg-white/10 text-ink" : "hover:text-ink",
            )}
          >
            {l.label}
          </Link>
        );
      })}
      {roleLabel ? (
        <Chip tone="neutral" className="hidden lg:inline-flex">
          {roleLabel}
        </Chip>
      ) : null}
      <Link
        href={hasProfile ? "/profile" : "/onboarding"}
        className={cx(
          "shrink-0 rounded-lg px-2 py-1.5 transition sm:px-3",
          pathname === "/profile" || pathname === "/onboarding" ? "bg-white/10 text-ink" : "hover:text-ink",
        )}
      >
        {hasProfile ? "Profile" : "Set up"}
      </Link>
    </nav>
  );
}
