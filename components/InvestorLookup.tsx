"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getJSON } from "@/lib/client";
import type { DataMode, Investor } from "@/lib/types";
import { field, Spinner } from "./ui";

/** Single-investor search that opens a report with no startup context. */
export default function InvestorLookup({ mode }: { mode: DataMode }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ q: string; items: Investor[] } | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const searching = q.trim().length >= 2 && results?.q !== q.trim();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await getJSON<{ results: Investor[] }>(`/api/investors/search?${new URLSearchParams({ q: term, mode })}`, ac.signal);
        setResults({ q: term, items: r.results });
      } catch {
        if (!ac.signal.aborted) setResults({ q: term, items: [] });
      }
    }, mode === "cala" ? 450 : 150);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, mode]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function go(inv: Investor) {
    const id = inv.entityId || inv.id || inv.name;
    router.push(`/report?inv=${encodeURIComponent(id)}&mode=${mode}`);
  }

  const items = results?.q === q.trim() ? results.items : [];

  const showMenu = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} className={`relative ${showMenu ? "z-50" : "z-10"}`}>
      <input
        className={field}
        placeholder="Fund name…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && items[0]) {
            e.preventDefault();
            go(items[0]);
          }
        }}
        aria-label="Search investor"
      />
      {searching && <Spinner className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />}
      {showMenu && (
        <ul className="absolute top-full left-0 z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-[#0c0e14] p-1 shadow-[0_18px_50px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
          {items.length === 0 && !searching ? (
            <li className="px-3 py-2.5 text-xs text-muted">No matches</li>
          ) : (
            items.map((it) => (
              <li key={it.id}>
                <button type="button" onClick={() => go(it)} className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-white/[0.08]">
                  <div className="text-sm font-medium text-ink">{it.name}</div>
                  {(it.description || it.kind) && <div className="mt-0.5 truncate text-xs text-muted">{it.description ?? it.kind}</div>}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
