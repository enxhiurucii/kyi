// Minimal typed client for the Cala REST API (spec: https://api.cala.ai/openapi.json).
//   POST /v1/knowledge/query              structured rows  (Cala QL or natural language)
//   POST /v1/knowledge/search             markdown answer + citations
//   GET  /v1/entities?name=&limit=        fuzzy name → entity ids
//   GET  /v1/entities/{id}/introspection  which properties / relationships exist
//   POST /v1/entities/{id}                retrieve properties / relationships (with sources)
// Auth: header "X-API-KEY". Get a key at https://console.cala.ai/api-keys

import { cached } from "../cache";
import type { Ctx } from "../provider";
import { ProviderError } from "../provider";

const BASE = (process.env.CALA_API_BASE || "https://api.cala.ai").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.CALA_TIMEOUT_MS || 180_000); // Cala docs: queries can take up to 180 s
const TTL_MS = Number(process.env.KYI_CACHE_TTL_HOURS || 72) * 3600 * 1000;
const MAX_CONCURRENT = Number(process.env.CALA_MAX_CONCURRENCY || 6);

// ---------- Response types (subset of the OpenAPI spec) ----------

export interface CalaEntityMention {
  id: string;
  name: string;
  entity_type: string;
  mentions?: string[];
}

export interface CalaEntity {
  id: string;
  name: string;
  entity_type: string;
  description?: string | null;
}

export interface CalaQueryResponse {
  results: Record<string, unknown>[];
  entities: CalaEntityMention[] | null;
}

export interface CalaOrigin {
  source?: { name?: string; url?: string };
  document?: { name?: string; url?: string };
}

export interface CalaAnswer {
  content: string;
  explainability: { content: string; references: string[] }[] | null;
  context: { id: string; content: string; origins: CalaOrigin[] }[];
  entities: CalaEntityMention[] | null;
}

export interface CalaIntrospection {
  properties: string[];
  relationships: { outgoing: string[]; incoming: string[] };
  numerical_observations: Record<string, unknown>;
}

export interface CalaSourceRef {
  name?: string;
  date?: string;
  document?: string | { endpoint?: string; url?: string };
}

export interface CalaRelated {
  id: string;
  name: string;
  entity_type: string;
  properties?: Record<string, unknown> & { sources?: CalaSourceRef[] };
}

export interface CalaRetrieved {
  id: string;
  name: string;
  entity_type: string;
  description?: string | null;
  properties: Record<string, { value: unknown; sources?: CalaSourceRef[] }>;
  relationships: { outgoing: Record<string, CalaRelated[]>; incoming: Record<string, CalaRelated[]> };
}

export interface RetrieveBody {
  properties?: string[];
  relationships?: {
    outgoing?: Record<string, { limit?: number; offset?: number }>;
    incoming?: Record<string, { limit?: number; offset?: number }>;
  };
}

// ---------- Plumbing ----------

// Pace requests to stay under Cala's rate limit (requests per minute). Tune with CALA_RPM.
const RPM = Math.max(1, Number(process.env.CALA_RPM || 9)); // measured: ~10 requests/minute on a hackathon key
const BACKOFF_MS = Number(process.env.CALA_429_BACKOFF_MS || 20_000);
let nextSlotAt = 0;
async function paced(): Promise<void> {
  const interval = 60_000 / RPM;
  const now = Date.now();
  const at = Math.max(now, nextSlotAt);
  nextSlotAt = at + interval;
  if (at > now) await new Promise((res) => setTimeout(res, at - now));
}

let active = 0;
const waiters: (() => void)[] = [];
async function slot(): Promise<() => void> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((res) => waiters.push(res));
  active++;
  return () => {
    active--;
    waiters.shift()?.();
  };
}

export function calaConfigured(): boolean {
  return Boolean(process.env.CALA_API_KEY);
}

async function request<T>(method: "GET" | "POST", path: string, body: unknown, ctx: Ctx, label: string): Promise<T> {
  const key = process.env.CALA_API_KEY;
  if (!key) {
    throw new ProviderError("CALA_API_KEY is not set. Add it to .env.local (see README) or switch to demo data.", "missing_key", 400);
  }
  const cacheKey = `${method} ${path} ${body ? JSON.stringify(body) : ""}`;
  ctx.queries.push(label);
  return cached<T>(
    cacheKey,
    TTL_MS,
    async () => {
      const release = await slot();
      ctx.calls++;
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
      try {
        const send = async () => {
          await paced();
          return fetch(`${BASE}${path}`, {
            method,
            headers: { "X-API-KEY": key, "Content-Type": "application/json", Accept: "application/json" },
            body: body ? JSON.stringify(body) : undefined,
            signal: ac.signal,
            cache: "no-store",
          });
        };
        let res = await send();
        if (res.status === 429) {
          // One polite retry after a pause, then give up and tell the user.
          const retryAfter = Number(res.headers.get("retry-after"));
          await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : BACKOFF_MS));
          res = await send();
        }
        const text = await res.text();
        let json: unknown = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        if (res.status === 401 || res.status === 403) {
          throw new ProviderError("Cala rejected the API key (check CALA_API_KEY and your credits in console.cala.ai).", "auth", 401);
        }
        if (res.status === 429) throw new ProviderError("Cala rate limit reached — wait a moment and try again.", "rate_limited", 429);
        if (!res.ok) {
          const msg = errorMessage(json) ?? text.slice(0, 200);
          throw new ProviderError(`Cala error ${res.status}: ${msg}`, res.status === 422 ? "bad_request" : "upstream", 502);
        }
        const errMsg = errorMessage(json);
        if (errMsg && (json as { response_type?: string })?.response_type === "ERROR") {
          throw new ProviderError(`Cala error: ${errMsg}`, "upstream", 502);
        }
        return json as T;
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        if ((e as Error).name === "AbortError") throw new ProviderError("Cala took too long to answer (timeout). Try again.", "timeout", 504);
        throw new ProviderError(`Could not reach Cala: ${(e as Error).message}`, "upstream", 502);
      } finally {
        clearTimeout(timer);
        release();
      }
    },
    () => ctx.cacheHits++,
  );
}

function errorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as { detail?: unknown; error?: { message?: string } };
  if (o.error?.message) return o.error.message;
  if (typeof o.detail === "string") return o.detail;
  if (Array.isArray(o.detail)) return JSON.stringify(o.detail).slice(0, 200);
  return null;
}

// ---------- Endpoints ----------

export const cala = {
  query(input: string, ctx: Ctx) {
    return request<CalaQueryResponse>("POST", "/v1/knowledge/query", { input, return_entities: true }, ctx, input);
  },
  search(input: string, ctx: Ctx) {
    return request<CalaAnswer>("POST", "/v1/knowledge/search", { input, explainability: true, return_entities: true }, ctx, `search: ${input}`);
  },
  searchEntities(name: string, limit: number, ctx: Ctx) {
    const qs = new URLSearchParams({ name, limit: String(limit) });
    return request<{ entities: CalaEntity[] }>("GET", `/v1/entities?${qs}`, null, ctx, `GET /v1/entities?name=${name}`);
  },
  introspect(id: string, ctx: Ctx) {
    return request<CalaIntrospection>("GET", `/v1/entities/${encodeURIComponent(id)}/introspection`, null, ctx, `GET /v1/entities/${id}/introspection`);
  },
  /** `label` is what shows up in the UI trace (use a generic label for repeated graph reads). */
  retrieve(id: string, body: RetrieveBody | null, ctx: Ctx, label?: string) {
    return request<CalaRetrieved>("POST", `/v1/entities/${encodeURIComponent(id)}`, body ?? undefined, ctx, label ?? `POST /v1/entities/${id}`);
  },
};
