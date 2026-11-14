// Two-level cache (memory + JSON files on disk).
// Why: Cala queries can take seconds and cost credits. Cache everything, pre-warm the
// investors you will demo (see scripts/warm-cache.mjs), and the demo is instant.

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const DIR = process.env.KYI_CACHE_DIR || path.join(process.cwd(), ".kyi-cache");
const mem = new Map<string, { exp: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

function fileFor(key: string): string {
  return path.join(DIR, `${createHash("sha1").update(key).digest("hex")}.json`);
}

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>, onHit?: () => void): Promise<T> {
  const now = Date.now();
  const m = mem.get(key);
  if (m && m.exp > now) {
    onHit?.();
    return m.value as T;
  }
  try {
    const raw = JSON.parse(await fs.readFile(fileFor(key), "utf8")) as { exp: number; value: T };
    if (raw.exp > now) {
      mem.set(key, { exp: raw.exp, value: raw.value });
      onHit?.();
      return raw.value;
    }
  } catch {
    // not cached yet
  }
  const running = inflight.get(key);
  if (running) {
    onHit?.();
    return running as Promise<T>;
  }
  const p = (async () => {
    try {
      const value = await fn();
      const exp = Date.now() + ttlMs;
      mem.set(key, { exp, value });
      try {
        await fs.mkdir(DIR, { recursive: true });
        await fs.writeFile(fileFor(key), JSON.stringify({ key, exp, value }));
      } catch {
        // read-only filesystem (e.g. serverless): memory cache only
      }
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** Run async tasks with a concurrency limit, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
