"use client";

import { formatCountries, MARKET_PRESETS, parseCountries, toggleCountry } from "@/lib/countries";
import { cx, field } from "./ui";

export default function CountryMultiSelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  id?: string;
}) {
  const selected = parseCountries(value);
  const selectedLower = new Set(selected.map((c) => c.toLowerCase()));
  const custom = selected.filter((c) => !MARKET_PRESETS.some((p) => p.toLowerCase() === c.toLowerCase()));

  return (
    <div className="space-y-2" id={id}>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Markets">
        {MARKET_PRESETS.map((c) => {
          const on = selectedLower.has(c.toLowerCase());
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(toggleCountry(value, c))}
              className={cx(
                "rounded-lg border px-2 py-1 text-[11px] font-medium transition",
                on ? "border-accent/50 bg-accent-soft text-ink" : "border-line text-muted hover:border-line hover:text-ink",
              )}
            >
              {c}
            </button>
          );
        })}
      </div>
      <input
        className={field}
        placeholder="Other (comma-separated)"
        value={custom.join(", ")}
        onChange={(e) => {
          const extras = parseCountries(e.target.value);
          const presets = selected.filter((c) => MARKET_PRESETS.some((p) => p.toLowerCase() === c.toLowerCase()));
          onChange(formatCountries([...presets, ...extras]));
        }}
        aria-label="Other countries"
      />
      {selected.length > 0 ? (
        <p className="text-[11px] text-muted">
          {selected.length} market{selected.length === 1 ? "" : "s"}: {formatCountries(selected)}
        </p>
      ) : (
        <p className="text-[11px] text-muted">Pick one or more markets (optional).</p>
      )}
    </div>
  );
}
