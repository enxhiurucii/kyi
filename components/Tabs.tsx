"use client";

import { useState, type ReactNode } from "react";
import { cx } from "./ui";

/** Accessible tabs for fit dashboards — keeps long content off the page scroll. */
export default function Tabs({
  tabs,
  initial,
  className,
  listClassName,
  panelClassName,
}: {
  tabs: { id: string; label: string; panel: ReactNode }[];
  initial?: string;
  className?: string;
  listClassName?: string;
  panelClassName?: string;
}) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id ?? "");
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div className={cx("flex min-h-0 min-w-0 flex-col", className)}>
      <div
        role="tablist"
        aria-label="Sections"
        className={cx("flex shrink-0 flex-wrap gap-1 border-b border-line pb-2", listClassName)}
      >
        {tabs.map((t) => {
          const selected = t.id === current?.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`tab-${t.id}`}
              data-testid={`report-tab-${t.id}`}
              className={cx(
                "rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                selected ? "bg-white/10 text-ink" : "text-muted hover:text-ink",
              )}
              onClick={() => setActive(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        aria-labelledby={current ? `tab-${current.id}` : undefined}
        className={cx("mt-3 min-h-0 min-w-0 flex-1 overflow-auto", panelClassName)}
      >
        {current?.panel}
      </div>
    </div>
  );
}
