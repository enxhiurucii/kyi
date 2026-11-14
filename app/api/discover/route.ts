import { connection } from "next/server";
import {
  discoverDemoStartups,
  scoreStartupForThesis,
  type InvestorThesis,
  type RankedStartup,
} from "@/lib/discover";
import { newCtx } from "@/lib/provider";
import { inferSectors } from "@/lib/similarity";
import { errorResponse, getProvider, parseStartup } from "@/lib/service";
import type { Company } from "@/lib/types";

type Body = {
  description?: unknown;
  stage?: unknown;
  country?: unknown;
  mode?: unknown;
};

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(req: Request) {
  await connection();
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const startup = parseStartup({
      description: body?.description,
      stage: body?.stage,
      country: body?.country,
    });
    if (!startup?.description.trim()) {
      return Response.json({ error: "Describe what you want to invest in (thesis)." }, { status: 400 });
    }

    const thesis: InvestorThesis = {
      description: startup.description,
      stage: startup.stage,
      country: startup.country,
    };

    const provider = getProvider(body?.mode);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(sse(obj)));
        try {
          send({ type: "meta", dataMode: provider.mode, thesis });

          if (provider.mode === "demo") {
            send({ type: "status", message: "Scoring demo startups…" });
            const ranked = discoverDemoStartups(thesis, 12);
            for (const row of ranked) {
              send({ type: "item", row });
              // Pace demo so the UI paints one card at a time.
              await new Promise((r) => setTimeout(r, 90));
            }
            send({ type: "done", total: ranked.length });
            return;
          }

          // Live Cala — search first, then score each hit from company text (no per-company round walks).
          const ctx = newCtx();
          send({ type: "status", message: "Searching Cala for companies…" });

          const sectors = inferSectors(thesis.description);
          const queries = [
            thesis.description.split(/\s+/).slice(0, 4).join(" "),
            ...sectors.slice(0, 2),
            thesis.country.trim() || "",
          ]
            .map((q) => q.trim())
            .filter((q) => q.length >= 2);

          const unique = new Map<string, Company>();
          const qList = [...new Set(queries)].slice(0, 3);
          const batches = await Promise.all(
            qList.map(async (q) => {
              try {
                return await provider.searchCompanies(q, ctx);
              } catch {
                return [] as Company[];
              }
            }),
          );
          for (const hits of batches) {
            for (const c of hits) {
              if (!unique.has(c.id)) unique.set(c.id, c);
            }
          }

          const candidates = [...unique.values()].slice(0, 12);
          send({ type: "status", message: `Scoring ${candidates.length} companies…` });

          if (candidates.length === 0) {
            send({ type: "done", total: 0 });
            return;
          }

          let n = 0;
          for (const company of candidates) {
            // Skip getCompanyRounds here — that is what made the list feel stuck.
            // Stage / “raised recently” stay weaker; Diligence does the deep graph walk.
            const scored = scoreStartupForThesis(company, thesis, null);
            const row: RankedStartup = {
              company,
              score: scored.score,
              reasons: scored.reasons,
              lastRound: scored.lastRound,
              monthsSinceRaise: scored.monthsSinceRaise,
            };
            send({ type: "item", row });
            n += 1;
            // Yield so the client can paint between items.
            await new Promise((r) => setTimeout(r, 40));
          }
          send({ type: "done", total: n });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Discover failed.";
          send({ type: "error", message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
