// Small formatting helpers shared by server (talking points) and client (UI).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtMonthYear(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) return "unknown date";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function monthsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (30.4375 * 24 * 3600 * 1000);
}

export function fmtEur(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "–";
  if (n >= 1e9) return `€${(n / 1e9).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1e6) return `€${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `€${Math.round(n / 1e3)}k`;
  return `€${Math.round(n)}`;
}

export function fmtPct(r: number | null | undefined): string {
  if (r === null || r === undefined || !Number.isFinite(r)) return "–";
  return `${Math.round(r * 100)}%`;
}

export function fmtMonthsAgo(m: number | null | undefined): string {
  if (m === null || m === undefined) return "unknown";
  if (m < 1) return "this month";
  const r = Math.round(m);
  return `${r} month${r === 1 ? "" : "s"} ago`;
}

export function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(oy|oyj|ab|as|aps|asa|ltd|llc|inc|gmbh|sa|sas|bv|plc|lp|llp)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slug(s: string): string {
  return normName(s).replace(/\s+/g, "-") || "x";
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
}

/** "Lastu Robotics" → "Lastu Robotics'", "Oura" → "Oura's" */
export function possessive(name: string): string {
  return /s$/i.test(name.trim()) ? `${name}'` : `${name}'s`;
}
