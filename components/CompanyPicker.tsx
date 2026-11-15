"use client";

import { useEffect, useRef, useState } from "react";
import { getJSON } from "@/lib/client";
import type { Company, DataMode } from "@/lib/types";
import { SearchPulse } from "./GraphLoading";
import { field } from "./ui";

export default function CompanyPicker({
  value,
  onChange,
  mode,
}: {
  value: string;
  onChange: (v: string) => void;
  mode: DataMode;
}) {
  const [q, setQ] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setQ(value);
  }
  const [results, setResults] = useState<{ q: string; items: Company[] } | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const searching = q.trim().length >= 2 && results?.q !== q.trim();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await getJSON<{ results: Company[] }>(`/api/companies/search?${new URLSearchParams({ q: term, mode })}`, ac.signal);
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

  const items = results?.q === q.trim() ? results.items : [];

  return (
    <div ref={boxRef} className="relative">
      <input
        className={field}
        placeholder={mode === "cala" ? "Search Cala for a company…" : "Search the demo companies…"}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && q.trim()) {
            e.preventDefault();
            const name = items[0]?.name ?? q.trim();
            setQ(name);
            onChange(name);
            setOpen(false);
          }
        }}
        aria-label="Company to diligence"
      />
      {searching && <SearchPulse className="absolute right-3 top-3" />}
      {open && q.trim().length >= 2 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-[#12141c] p-1 shadow-2xl">
          {items.map((it) => (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => {
                  setQ(it.name);
                  onChange(it.name);
                  setOpen(false);
                }}
                className="w-full rounded-lg px-3 py-2 text-left hover:bg-white/5"
              >
                <div className="text-sm font-medium">{it.name}</div>
                {it.description && <div className="truncate text-xs text-muted">{it.description}</div>}
              </button>
            </li>
          ))}
          {!searching && items.length === 0 && (
            <li>
              <button
                type="button"
                onClick={() => {
                  onChange(q.trim());
                  setOpen(false);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5"
              >
                Use “{q.trim()}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
