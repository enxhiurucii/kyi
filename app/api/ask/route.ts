import Anthropic from "@anthropic-ai/sdk";
import { connection } from "next/server";
import { buildAskSystemPrompt, reportAskContext } from "@/lib/ask/context";
import { createAskTools } from "@/lib/ask/tools";
import { parseOwnCompany } from "@/lib/profiles/parse";
import { ProviderError } from "@/lib/provider";
import { buildInvestorReport, errorResponse, getProvider, parseStartup } from "@/lib/service";

type ChatMsg = { role: "user" | "assistant"; content: string };

function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function sse(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

export async function POST(req: Request) {
  await connection();
  if (!aiEnabled()) {
    return Response.json({ error: "AI ask is not configured.", code: "missing_key" }, { status: 400 });
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      investor?: unknown;
      startup?: unknown;
      company?: unknown;
      mode?: unknown;
      messages?: unknown;
    } | null;

    const investor = typeof body?.investor === "string" ? body.investor.trim() : "";
    if (!investor) return Response.json({ error: "Missing 'investor'." }, { status: 400 });

    const rawMessages = Array.isArray(body?.messages) ? body!.messages! : [];
    const messages: ChatMsg[] = rawMessages
      .filter((m): m is ChatMsg => !!m && typeof m === "object" && ((m as ChatMsg).role === "user" || (m as ChatMsg).role === "assistant") && typeof (m as ChatMsg).content === "string")
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
      .slice(-10);

    if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") {
      return Response.json({ error: "Send at least one user message." }, { status: 400 });
    }

    const provider = getProvider(body?.mode);
    const startup = parseStartup(body?.startup);
    const report = await buildInvestorReport(provider, investor, startup, "full", parseOwnCompany(body?.company));
    if (!report) {
      return Response.json({ error: `Could not find investor "${investor}".` }, { status: 404 });
    }

    const reportJson = JSON.stringify(reportAskContext(report));
    const systemText = buildAskSystemPrompt(reportJson);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(sse(obj)));
        try {
          const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
          const pendingLabels: string[] = [];
          const tools = createAskTools({
            report,
            mode: report.dataMode,
            onTool: (label) => pendingLabels.push(label),
          });

          const runner = client.beta.messages.toolRunner({
            model: "claude-opus-5-5",
            max_tokens: 64000,
            stream: true,
            output_config: { effort: "medium" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }],
            tools,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
          });

          for await (const messageStream of runner) {
            messageStream.on("contentBlock", (block) => {
              if (block.type === "tool_use") {
                runner.deferToolCall(block);
                const label =
                  block.name === "lookup_company"
                    ? "Looking up company in Cala…"
                    : block.name === "ask_cala"
                      ? "Asking Cala knowledge search…"
                      : block.name === "round_details"
                        ? "Opening round from the report…"
                        : `Running ${block.name}…`;
                send({ type: "tool", label });
              }
            });

            for await (const event of messageStream) {
              while (pendingLabels.length) {
                send({ type: "tool", label: pendingLabels.shift() });
              }
              if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
                send({ type: "text", delta: event.delta.text });
              }
            }

            while (pendingLabels.length) {
              send({ type: "tool", label: pendingLabels.shift() });
            }

            const message = await messageStream.finalMessage();
            const hasToolUse = message.content.some((b) => b.type === "tool_use");

            if (message.stop_reason === "refusal") {
              send({
                type: "text",
                delta: " I can’t help with that request. Try a question grounded in this investor’s report card.",
              });
              break;
            }
            if (message.stop_reason === "max_tokens" && hasToolUse) {
              send({
                type: "text",
                delta: " The answer was cut off before a tool finished — try a shorter question.",
              });
              break;
            }
          }

          send({ type: "done" });
        } catch (e) {
          const msg = e instanceof ProviderError ? e.message : e instanceof Error ? e.message : "Ask failed.";
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
