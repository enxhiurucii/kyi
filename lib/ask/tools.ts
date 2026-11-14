import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { cala } from "../cala/client";
import { countryFromAddress, propValue, sourcesFromProperties } from "../cala/parse";
import { newCtx, type Ctx } from "../provider";
import { getDemoWorld } from "../providers/demoWorld";
import { inferSectors, normalizeSector } from "../similarity";
import type { DataMode, InvestorReport, Round } from "../types";

const BUDGET = 3;

export type AskToolEvent = { type: "tool"; label: string };

export function createAskTools(opts: {
  report: InvestorReport;
  mode: DataMode;
  onTool: (label: string) => void;
}) {
  let calaCalls = 0;
  const ctx: Ctx = newCtx();

  function budgetOr(run: () => Promise<string> | string): Promise<string> | string {
    if (calaCalls >= BUDGET) return JSON.stringify({ error: "budget reached" });
    return run();
  }

  async function spend(): Promise<boolean> {
    if (calaCalls >= BUDGET) return false;
    calaCalls += 1;
    return true;
  }

  const lookup_company = {
    ...betaZodTool({
      name: "lookup_company",
      description: "Look up a company in Cala (or the demo world) for description, industry, HQ, website and sources.",
      inputSchema: z.object({
        name: z.string().describe("Company name to search for"),
      }),
      run: async ({ name }) =>
        budgetOr(async () => {
          opts.onTool("Looking up company in Cala…");
          if (opts.mode === "demo") {
            if (!(await spend())) return JSON.stringify({ error: "budget reached" });
            const w = getDemoWorld();
            const n = name.toLowerCase();
            const hit =
              Object.values(w.companies).find((c) => c.name.toLowerCase() === n) ??
              Object.values(w.companies).find((c) => c.name.toLowerCase().includes(n));
            if (!hit) return JSON.stringify({ error: "not found in demo data" });
            return JSON.stringify({
              id: hit.id,
              name: hit.name,
              description: hit.description,
              sectors: hit.sectors,
              country: hit.country,
              website: null,
              sources: [{ name: "KYI demo graph" }],
            });
          }
          if (!(await spend())) return JSON.stringify({ error: "budget reached" });
          const search = await cala.searchEntities(name.trim(), 5, ctx);
          const best = (search.entities ?? []).find((e) => e.entity_type === "Company" || e.entity_type === "Organization") ?? search.entities?.[0];
          if (!best) return JSON.stringify({ error: "not found" });
          if (!(await spend())) {
            return JSON.stringify({ id: best.id, name: best.name, description: best.description, note: "budget reached before full retrieve" });
          }
          const e = await cala.retrieve(
            best.id,
            {
              properties: ["name", "description", "website", "headquarters_address"],
              relationships: { outgoing: { OPERATES_IN_INDUSTRY: { limit: 4, offset: 0 } } },
            },
            ctx,
            `POST /v1/entities/{company} → ask lookup`,
          );
          const props = e.properties ?? {};
          const description = String(e.description ?? propValue(props, "description") ?? "").trim();
          const industries = e.relationships?.outgoing?.OPERATES_IN_INDUSTRY ?? [];
          const sectors = [
            ...industries.map((i) => normalizeSector(i.name)).filter(Boolean),
            ...inferSectors(description),
          ].map((s) => s.toLowerCase());
          return JSON.stringify({
            id: e.id,
            name: e.name,
            description,
            website: propValue(props, "website") ?? null,
            country: countryFromAddress(propValue(props, "headquarters_address") as string | null),
            sectors: [...new Set(sectors)].slice(0, 8),
            sources: sourcesFromProperties(props as Record<string, { sources?: unknown }>),
          });
        }),
    }),
    eager_input_streaming: true as const,
  };

  const ask_cala = {
    ...betaZodTool({
      name: "ask_cala",
      description: "Ask Cala's knowledge search a free-text question about this investor or market. Use sparingly.",
      inputSchema: z.object({
        question: z.string().describe("Natural-language question for Cala knowledge search"),
      }),
      run: async ({ question }) =>
        budgetOr(async () => {
          opts.onTool("Asking Cala knowledge search…");
          if (opts.mode === "demo") {
            return JSON.stringify({ answer: "not available in demo data", sources: [] });
          }
          if (!(await spend())) return JSON.stringify({ error: "budget reached" });
          const res = await cala.search(question.trim(), ctx);
          const sources = (res.context ?? []).flatMap((c) =>
            (c.origins ?? []).map((o) => ({
              name: o.source?.name ?? o.document?.name ?? "Cala",
              url: o.source?.url ?? o.document?.url,
            })),
          );
          return JSON.stringify({ answer: res.content, sources });
        }),
    }),
    eager_input_streaming: true as const,
  };

  const round_details = {
    ...betaZodTool({
      name: "round_details",
      description: "Get full details for a funding round already in the REPORT (investors, lead flags, amount, sources).",
      inputSchema: z.object({
        roundId: z.string().describe("Round id from the REPORT JSON"),
      }),
      run: ({ roundId }) => {
        opts.onTool("Opening round from the report…");
        const round: Round | undefined = opts.report.rounds[roundId];
        if (!round) {
          // also allow matching entityId
          const alt = Object.values(opts.report.rounds).find((r) => r.entityId === roundId || r.id === roundId);
          if (!alt) return JSON.stringify({ error: "round not in report" });
          return JSON.stringify(alt);
        }
        return JSON.stringify(round);
      },
    }),
    eager_input_streaming: true as const,
  };

  return [lookup_company, ask_cala, round_details];
}
