"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getJSON, postJSON } from "@/lib/client";
import { listIncomingForCompany, subscribeInterests } from "@/lib/interests/localStore";
import type { IncomingInterest, InterestRecord } from "@/lib/interests/types";
import { companyToStartup, profileStore, subscribeProfile } from "@/lib/profileStore";
import type { CompanyProfile } from "@/lib/profiles/types";
import type { DataMode, Startup } from "@/lib/types";
import { btn, Card, Chip, Label, Spinner } from "./ui";

type Props = {
  mode: DataMode;
};

export default function InterestedInvestors({ mode }: Props) {
  const { user, accountsEnabled } = useAuth();
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [startup, setStartup] = useState<Startup | null>(null);
  const [rows, setRows] = useState<IncomingInterest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function sync() {
      const c = profileStore.getCompany();
      setCompany(c);
      setStartup(companyToStartup(c));
    }
    sync();
    return subscribeProfile(sync);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      await Promise.resolve();
      if (ac.signal.aborted) return;

      if (!company?.name || !company.discoverable) {
        setRows([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const local = listIncomingForCompany(company.name, company.id);
        let enriched: IncomingInterest[] = [];

        if (local.length) {
          const res = await postJSON<{ interests: IncomingInterest[] }>(
            "/api/interests",
            {
              enrichLocal: true,
              localInterests: local,
              company,
              startup,
              mode,
            },
            ac.signal,
          );
          if (ac.signal.aborted) return;
          enriched = res.interests;
        }

        if (accountsEnabled && user) {
          try {
            const cloud = await getJSON<{ interests: IncomingInterest[] }>(
              `/api/interests?view=incoming&mode=${mode}`,
              ac.signal,
            );
            if (ac.signal.aborted) return;
            const byId = new Map<string, IncomingInterest>();
            for (const r of enriched) byId.set(`${r.investorUserId}:${r.companyId}`, r);
            for (const r of cloud.interests) byId.set(`${r.investorUserId}:${r.companyId}`, r);
            enriched = [...byId.values()];
          } catch {
            /* local demo still works */
          }
        }

        if (!ac.signal.aborted) setRows(enriched);
      } catch {
        if (ac.signal.aborted) return;
        const local = listIncomingForCompany(company.name, company.id);
        setRows(
          local.map(
            (r: InterestRecord): IncomingInterest => ({
              ...r,
              fitScore: null,
              thesisFitScore: null,
              mutualMatch: false,
              reportHref: `/report?inv=${encodeURIComponent(r.investorFirm)}&mode=${mode}`,
            }),
          ),
        );
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    const unsub = subscribeInterests(() => {
      // Re-trigger by bumping via abort+remount pattern: call load again
      void (async () => {
        await Promise.resolve();
        if (!company?.name || !company.discoverable) return;
        const local = listIncomingForCompany(company.name, company.id);
        if (!local.length) return;
        try {
          const res = await postJSON<{ interests: IncomingInterest[] }>("/api/interests", {
            enrichLocal: true,
            localInterests: local,
            company,
            startup,
            mode,
          });
          setRows(res.interests);
        } catch {
          /* ignore */
        }
      })();
    });

    return () => {
      ac.abort();
      unsub();
    };
  }, [company, startup, mode, accountsEnabled, user]);

  if (!company?.discoverable) return null;
  if (!loading && rows.length === 0) return null;

  return (
    <Card className="mb-8 p-5 sm:p-6" aria-live="polite">
      <Label>Inbound</Label>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">Investors interested in you</h2>
      <p className="mt-1 text-sm text-muted">
        They opted in after seeing your discoverable company. Investors never see who viewed them.
      </p>

      {loading && rows.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <Spinner className="text-accent" /> Loading…
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => {
            const firm = r.investorFirm || r.investorName || "Investor";
            const fit = r.fitScore != null ? Math.round(r.fitScore) : null;
            return (
              <li
                key={r.id}
                data-testid="interest-card"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-black/20 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium tracking-tight">
                    {firm} is interested
                    {fit != null ? <span className="text-muted"> · fit {fit}</span> : null}
                  </p>
                  {r.message ? <p className="mt-1 text-sm text-ink-2">&ldquo;{r.message}&rdquo;</p> : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.mutualMatch ? <Chip tone="good">Mutual match</Chip> : null}
                    {r.thesisFitScore != null ? (
                      <Chip tone="neutral">Thesis fit {Math.round(r.thesisFitScore)}</Chip>
                    ) : null}
                  </div>
                </div>
                <Link href={r.reportHref} className={`${btn.secondary} shrink-0`}>
                  See report card
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
