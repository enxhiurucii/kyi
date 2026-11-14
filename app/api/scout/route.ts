import Anthropic from "@anthropic-ai/sdk";
import { connection } from "next/server";
import { parseOwnCompany, parseFounderBody } from "@/lib/profiles/parse";
import type { CompanyProfile } from "@/lib/profiles/types";
import { ProviderError } from "@/lib/provider";
import { streamDemoScout } from "@/lib/scout/demoPlan";
import { SCOUT_FOUNDER_SYSTEM, SCOUT_INVESTOR_SYSTEM } from "@/lib/scout/prompt";
import { extractJsonObject, normalizeScoutPlan } from "@/lib/scout/schema";
import { createFounderScoutTools, createInvestorScoutTools } from "@/lib/scout/tools";
import { errorResponse, getProvider, parseStartup, parseThesis } from "@/lib/service";
import type { Thesis } from "@/lib/types";

function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function companyFromBody(raw: unknown, startup: { description: string; stage: string; country: string }): CompanyProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const hint = parseOwnCompany(raw);
  const name = typeof o.name === "string" ? o.name.trim() : hint?.name ?? "";
  if (!name && !hint?.entityId) return null;
  const existing: CompanyProfile["existingInvestors"] = [];
  if (Array.isArray(o.existingInvestors)) {
    for (const x of o.existingInvestors) {
      if (!x || typeof x !== "object") continue;
      const n = (x as { name?: unknown }).name;
      if (typeof n !== "string" || !n.trim()) continue;
      const entityId = (x as { entityId?: unknown }).entityId;
      existing.push({ name: n.trim(), entityId: typeof entityId === "string" ? entityId : undefined });
    }
  }
  return {
    name,
    oneLiner: typeof o.oneLiner === "string" ? o.oneLiner : startup.description,
    stage: (typeof o.stage === "string" ? o.stage : startup.stage) as CompanyProfile["stage"],
    country: typeof o.country === "string" ? o.country : startup.country,
    sectors: Array.isArray(o.sectors) ? o.sectors.filter((s): s is string => typeof s === "string") : [],
    existingInvestors: existing,
    calaCompanyId: hint?.entityId,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
  };
}

function defaultThesis(): Thesis {
  return {
    sectors: ["logistics", "mobility"],
    stages: ["pre-seed", "seed"],
    regions: ["Nordics", "Baltics"],
    ticketMinEur: 500_000,
    ticketMaxEur: 3_000_000,
  };
}

export async function POST(req: Request) {
  await connection();

  try {
    const body = (await req.json().catch(() => null)) as {
      for?: unknown;
      startup?: unknown;
      thesis?: unknown;
      mode?: unknown;
      founder?: unknown;
      company?: unknown;
    } | null;

    const scoutFor = body?.for === "investor" ? "investor" : "founder";
    const provider = getProvider(body?.mode);

    // Demo path: deterministic, no Claude — works without API key.
    if (provider.mode === "demo") {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (obj: unknown) => controller.enqueue(encoder.encode(sse(obj)));
          try {
            send({ type: "step", icon: "🚀", text: "Scout starting · demo graph" });
            if (scoutFor === "investor") {
              const thesis = parseThesis(body?.thesis) ?? defaultThesis();
              await streamDemoScout(send, "investor", { thesis });
            } else {
              const startup = parseStartup(body?.startup) ?? {
                description: "AI route planning for trucking fleets",
                stage: "seed" as const,
                country: "Finland",
              };
              const founder = parseFounderBody(body?.founder);
              const company = companyFromBody(body?.company, startup);
              await streamDemoScout(send, "founder", { startup, founder, company });
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Scout failed.";
            send({ type: "error", message: msg });
            send({ type: "done" });
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
    }

    if (!aiEnabled()) {
      return Response.json({ error: "Scout needs ANTHROPIC_API_KEY.", code: "missing_key" }, { status: 400 });
    }

    if (scoutFor === "investor") {
      const thesis = parseThesis(body?.thesis);
      if (!thesis) {
        return Response.json({ error: "Set your thesis (sectors / stages / regions) first." }, { status: 400 });
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (obj: unknown) => controller.enqueue(encoder.encode(sse(obj)));
          try {
            send({ type: "step", icon: "🚀", text: "Scout starting · live Cala" });
            await runClaudeScout({
              send,
              system: SCOUT_INVESTOR_SYSTEM,
              tools: createInvestorScoutTools({
                thesis,
                mode: provider.mode,
                onStep: (icon, text) => send({ type: "step", icon, text }),
              }),
              userMsg: [
                `Thesis sectors: ${thesis.sectors.join(", ") || "any"}`,
                `Stages: ${thesis.stages.join(", ") || "any"}`,
                `Regions: ${thesis.regions.join(", ") || "any"}`,
                thesis.ticketMinEur != null || thesis.ticketMaxEur != null
                  ? `Ticket: ${thesis.ticketMinEur ?? "?"} – ${thesis.ticketMaxEur ?? "?"} EUR`
                  : "Ticket: unspecified",
                'Produce the final PLAN JSON for the top 5 companies (for: "investor").',
              ].join("\n"),
              forSide: "investor",
            });
            send({ type: "done" });
          } catch (e) {
            const msg = e instanceof ProviderError ? e.message : e instanceof Error ? e.message : "Scout failed.";
            send({ type: "error", message: msg });
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
    }

    const startup = parseStartup(body?.startup);
    if (!startup?.description.trim()) {
      return Response.json({ error: "Describe your startup first." }, { status: 400 });
    }
    const founder = parseFounderBody(body?.founder);
    const company = companyFromBody(body?.company, startup);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(sse(obj)));
        try {
          send({ type: "step", icon: "🚀", text: "Scout starting · live Cala" });
          await runClaudeScout({
            send,
            system: SCOUT_FOUNDER_SYSTEM,
            tools: createFounderScoutTools({
              startup,
              mode: provider.mode,
              founder,
              company,
              onStep: (icon, text) => send({ type: "step", icon, text }),
            }),
            userMsg: [
              `Startup: ${startup.description}`,
              `Stage: ${startup.stage}`,
              `Markets / countries: ${startup.country || "unspecified"}`,
              founder ? `Founder: ${founder.fullName}` : "Founder profile: none",
              company?.name ? `Company: ${company.name}` : "Company profile: none",
              'Produce the final PLAN JSON for the top 5 investors (for: "founder").',
            ].join("\n"),
            forSide: "founder",
          });
          send({ type: "done" });
        } catch (e) {
          const msg = e instanceof ProviderError ? e.message : e instanceof Error ? e.message : "Scout failed.";
          send({ type: "error", message: msg });
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

async function runClaudeScout(opts: {
  send: (obj: unknown) => void;
  system: string;
  tools: ReturnType<typeof createFounderScoutTools> | ReturnType<typeof createInvestorScoutTools>;
  userMsg: string;
  forSide: "founder" | "investor";
}) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const runner = client.beta.messages.toolRunner({
    model: "claude-opus-5-5",
    max_tokens: 64000,
    stream: true,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    tools: opts.tools,
    messages: [{ role: "user", content: opts.userMsg }],
  });

  let textBuf = "";
  let askedFix = false;

  for await (const messageStream of runner) {
    messageStream.on("contentBlock", (block) => {
      if (block.type === "tool_use") {
        runner.deferToolCall(block);
      }
    });

    for await (const event of messageStream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
        textBuf += event.delta.text;
      }
    }

    const message = await messageStream.finalMessage();
    const hasToolUse = message.content.some((b) => b.type === "tool_use");

    if (message.stop_reason === "refusal") {
      opts.send({ type: "error", message: "Scout declined that request. Try a clearer brief." });
      return;
    }
    if (message.stop_reason === "max_tokens" && hasToolUse) {
      opts.send({
        type: "error",
        message: "Scout ran out of tokens mid-tool. Try again with a shorter brief.",
      });
      return;
    }

    if (!hasToolUse && message.stop_reason === "end_turn") {
      const raw = extractJsonObject(textBuf);
      const plan = normalizeScoutPlan(raw);
      if (plan) {
        opts.send({ type: "plan", plan: { ...plan, for: plan.for ?? opts.forSide } });
        return;
      }
      if (!askedFix) {
        askedFix = true;
        textBuf = "";
        opts.send({ type: "step", icon: "🛠️", text: "Fixing plan JSON…" });
        runner.pushMessages({
          role: "user",
          content:
            'Your last reply was not valid PLAN JSON. Reply with ONLY the corrected JSON object: { summary?, for, items[{ name, id?, score, why[], evidenceRoundIds[], risk?, draftMessage }] }. No markdown.',
        });
        continue;
      }
      opts.send({ type: "error", message: "Could not validate the scout plan." });
      return;
    }
  }
}
