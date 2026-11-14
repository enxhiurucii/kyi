"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { companyHref, postJSON } from "@/lib/client";
import { profileStore, subscribeProfile } from "@/lib/profileStore";
import type { WatchlistItem } from "@/lib/profiles/types";
import type { CompanyReport, Thesis } from "@/lib/types";
import { btn, Card, FitPage, ModeBadge, ScoreRing, Spinner, field } from "./ui";

function thesisFromInvestor(): Thesis | null {
  const inv = profileStore.getInvestor();
  if (!inv) return null;
  return {
    sectors: inv.thesisSectors,
    stages: inv.thesisStages,
    regions: inv.thesisRegions,
    ticketMinEur: inv.ticketMinEur,
    ticketMaxEur: inv.ticketMaxEur,
  };
}

export default function WatchlistView() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [isInvestor, setIsInvestor] = useState(false);
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [loadingScores, setLoadingScores] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    const sync = () => {
      const list = profileStore.getWatchlist();
      setItems(list);
      setIsInvestor(profileStore.getRoles().includes("investor") || Boolean(profileStore.getInvestor()));
      setNotes(Object.fromEntries(list.map((i) => [i.id, i.note ?? ""])));
    };
    sync();
    return subscribeProfile(sync);
  }, []);

  useEffect(() => {
    if (!items.length) return;
    const thesis = thesisFromInvestor();
    const ac = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (ac.signal.aborted) return;
      setLoadingScores(true);
      try {
        const rows = await Promise.all(
          items.map(async (it) => {
            try {
              const r = await postJSON<CompanyReport>(
                "/api/company",
                { company: it.companyRef || it.companyName, thesis: thesis ?? undefined, mode: it.dataMode },
                ac.signal,
              );
              return [it.id, r.raiseSoon?.score ?? null] as const;
            } catch {
              return [it.id, null] as const;
            }
          }),
        );
        if (ac.signal.aborted) return;
        setScores(Object.fromEntries(rows));
        setLoadingScores(false);
      } catch {
        if (!ac.signal.aborted) setLoadingScores(false);
      }
    })();
    return () => ac.abort();
  }, [items]);

  if (!isInvestor && items.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Watchlist</h1>
        <p className="mt-2 text-sm text-muted">Set up an investor profile to save companies you want to track.</p>
        <Link href="/onboarding" className={`${btn.primary} mt-6`}>
          Set up investor profile →
        </Link>
      </div>
    );
  }

  const thesis = thesisFromInvestor();

  return (
    <FitPage>
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Invest</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight fit:text-xl">Watchlist</h1>
        </div>
        {items[0] ? <ModeBadge mode={items[0].dataMode} /> : null}
      </div>
      <p className="mt-2 shrink-0 text-sm text-muted fit:mt-1 fit:text-xs">
        Saved companies with raise-soon scores. Stored on this device or your account when signed in.
      </p>

      {items.length === 0 ? (
        <Card className="mt-8 p-6 text-center fit:mt-4">
          <p className="text-sm text-ink-2">No companies yet.</p>
          <Link href="/market" className={`${btn.secondary} mt-4`}>
            Open Market Radar →
          </Link>
        </Card>
      ) : (
        <ul className="mt-8 min-h-0 space-y-3 fit:mt-3 fit:flex-1 fit:overflow-auto fit:fit-scroll">
          {items.map((it) => (
            <li key={it.id}>
              <Card className="p-4 sm:p-5 fit:p-3">
                <div className="flex flex-wrap items-start gap-4 fit:gap-3">
                  {loadingScores && scores[it.id] === undefined ? (
                    <Spinner className="mt-2 text-muted" />
                  ) : scores[it.id] != null ? (
                    <ScoreRing score={scores[it.id]!} size={52} label="Raise-soon" />
                  ) : (
                    <div className="grid h-[52px] w-[52px] place-items-center rounded-full bg-surface-2 text-[10px] text-muted">—</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={companyHref(it.companyName, thesis, it.dataMode)}
                        className="font-medium text-ink hover:text-accent"
                      >
                        {it.companyName}
                      </Link>
                      <ModeBadge mode={it.dataMode} />
                    </div>
                    <input
                      className={`${field} mt-2 fit:mt-1.5 fit:py-2`}
                      placeholder="Note…"
                      value={notes[it.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [it.id]: e.target.value }))}
                      onBlur={() => {
                        profileStore.upsertWatchlistItem({
                          id: it.id,
                          companyRef: it.companyRef,
                          companyName: it.companyName,
                          dataMode: it.dataMode,
                          note: (notes[it.id] ?? "").trim() || undefined,
                          createdAt: it.createdAt,
                        });
                      }}
                    />
                    <div className="mt-3 flex flex-wrap gap-2 fit:mt-2">
                      <Link href={companyHref(it.companyName, thesis, it.dataMode)} className={btn.secondary}>
                        Company card
                      </Link>
                      <button type="button" className={btn.ghost} onClick={() => profileStore.removeWatchlistItem(it.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </FitPage>
  );
}