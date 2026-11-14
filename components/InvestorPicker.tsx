"use client";

// Investor list editor: free-text list (one per line) + live search against the data source.
import { useEffect, useRef, useState } from "react";
import { getJSON, parseInvestorList } from "@/lib/client";
import type { DataMode, Investor } from "@/lib/types";
import { field, Spinner } from "./ui";

export default function InvestorPicker({ value, onChange, mode }: { value: string; onChange: (v: string) => void; mode: DataMode }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ q: string; items: Investor[] } | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const names = parseInvestorList(value);
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

  function add(name: string) {
    if (!names.includes(name)) onChange([...names, name].join("\n"));
    setQ("");
    setOpen(false);
  }

  const items = results?.q === q.trim() ? results.items : [];

  return (
    <div className="space-y-2">
      <div ref={boxRef} className="relative">
        <input
          className={field}
          placeholder={mode === "cala" ? "Search Cala for an investor…" : "Search the demo investors…"}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              e.preventDefault();
              add(items[0]?.name ?? q.trim());
            }
          }}
          aria-label="Search investors"
        />
        {searching && <Spinner className="absolute right-3 top-3 text-muted" />}
        {open && q.trim().length >= 2 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-[#12141c] p-1 shadow-2xl">
            {items.map((it) => (
              <li key={it.id}>
                <button type="button" onClick={() => add(it.name)} className="w-full rounded-lg px-3 py-2 text-left hover:bg-surface-2">
                  <div className="text-sm font-medium">{it.name}</div>
                  {(it.description || it.kind) && <div className="truncate text-xs text-muted">{it.description ?? it.kind}</div>}
                </button>
              </li>
            ))}
            {!searching && items.length === 0 && (
              <li>
                <button type="button" onClick={() => add(q.trim())} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2">
                  Add “{q.trim()}”
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      <textarea
        className={`${field} min-h-[148px] font-mono text-[13px] leading-6`}
        placeholder={"One investor per line, e.g.\nLifeline Ventures\nMaki.vc"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Investors you are meeting"
      />
      <div className="text-xs text-muted">{names.length} investor{names.length === 1 ? "" : "s"}</div>
    </div>
  );
}
