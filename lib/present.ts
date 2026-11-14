const KEY = "kyi.present.v1";

export function readPresentFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function writePresentFlag(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) window.sessionStorage.setItem(KEY, "1");
    else window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Append present=1 to relative hrefs when presentation mode is on. */
export function withPresent(href: string): string {
  if (typeof window === "undefined") return href;
  if (!readPresentFlag() && !new URLSearchParams(window.location.search).has("present")) return href;
  try {
    const u = new URL(href, window.location.origin);
    u.searchParams.set("present", "1");
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return href;
  }
}
