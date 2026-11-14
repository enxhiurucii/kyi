"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { getJSON } from "@/lib/client";
import { profileStore } from "@/lib/profileStore";
import type { DataMode, Round, Startup } from "@/lib/types";
import type { Evidence } from "./EvidenceDrawer";
import { btn, Chip, cx, field, Spinner } from "./ui";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[] };

const SUGGESTIONS = [
  "Have they backed startups like mine in the Nordics?",
  "Which of their deals is closest to my startup?",
  "Who do they co-invest with most, and in which deals?",
  "Draft a 5-sentence intro email that mentions a relevant deal of theirs",
  "What should I ask them in the meeting?",
];

export default function AskPanel({
  investorName,
  investorId,
  startup,
  mode,
  rounds,
  onEvidence,
}: {
  investorName: string;
  investorId: string;
  startup: Startup | null;
  mode: DataMode;
  rounds: Record<string, Round>;
  onEvidence: (e: Evidence) => void;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolStatus, setToolStatus] = useState<string[]>([]);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    getJSON<{ aiEnabled?: boolean }>("/api/health", ac.signal)
      .then((h) => setEnabled(Boolean(h.aiEnabled)))
      .catch(() => setEnabled(false));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, toolStatus, busy, open]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (enabled === false) return null;
  if (enabled === null) return null;

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setError("");
    setInput("");
    setToolStatus([]);
    const history: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(history);
    setBusy(true);
    setMessages((m) => [...m, { role: "assistant", content: "", tools: [] }]);

    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          investor: investorId || investorName,
          startup: startup ?? undefined,
          company: startup ? profileStore.getCompany() : undefined,
          mode,
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `Ask failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const draft = { text: "", tools: [] as string[] };

      const flushAssistant = () => {
        const text = draft.text;
        const tools = [...draft.tools];
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: text, tools };
          return next;
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let ev: { type: string; delta?: string; label?: string; message?: string };
          try {
            ev = JSON.parse(line.slice(6)) as typeof ev;
          } catch {
            continue;
          }
          if (ev.type === "text" && ev.delta) {
            draft.text += ev.delta;
            flushAssistant();
          } else if (ev.type === "tool" && ev.label) {
            draft.tools = [...draft.tools, ev.label];
            setToolStatus((s) => [...s, ev.label!]);
            flushAssistant();
          } else if (ev.type === "error") {
            throw new Error(ev.message ?? "Ask failed.");
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && !last.content) next.pop();
        return next;
      });
    } finally {
      setBusy(false);
      setToolStatus([]);
    }
  }

  function openRound(id: string) {
    const round = rounds[id] ?? Object.values(rounds).find((r) => r.entityId === id || r.id === id);
    if (!round) return;
    onEvidence({
      title: `${round.companyName || "Round"} · ${round.stageLabel}`,
      subtitle: "Cited from the Ask answer",
      groups: [{ title: "", rounds: [round] }],
    });
  }

  return (
    <div className="no-print pointer-events-none fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {open && (
        <>
          <button
            type="button"
            className="pointer-events-auto fixed inset-0 z-40 cursor-default bg-black/35 backdrop-blur-[2px]"
            aria-label="Close ask chat"
            onClick={() => setOpen(false)}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Ask about ${investorName}`}
            className="pointer-events-auto relative z-50 flex w-[min(100vw-1.25rem,28rem)] flex-col overflow-hidden rounded-2xl border border-line bg-[#10131a] shadow-[0_28px_90px_rgba(0,0,0,0.6)] sm:w-[min(100vw-2rem,32rem)]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-ink">Ask about {investorName}</p>
                <p className="text-[10px] text-muted">Report + Cala · Esc to close</p>
              </div>
              <button
                type="button"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-white/5 hover:text-ink"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-1 border-b border-line bg-black/25 px-3 py-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy}
                    onClick={() => void ask(s)}
                    className="rounded-full border border-line bg-black/30 px-2 py-0.5 text-[9px] leading-snug text-ink-2 transition hover:border-accent/40 hover:text-ink disabled:opacity-50"
                  >
                    {s.length > 36 ? `${s.slice(0, 34)}…` : s}
                  </button>
                ))}
              </div>
            )}

            <div className="ask-chat flex max-h-[min(70vh,28rem)] min-h-[16rem] flex-col gap-2.5 overflow-y-auto px-3.5 py-3 sm:min-h-[18rem]">
              {messages.length === 0 && (
                <p className="m-auto max-w-[16rem] text-center text-xs leading-relaxed text-[#5c6370]">
                  Ask anything about this investor. Answers stay grounded in the report.
                </p>
              )}

              {messages.map((m, i) => {
                const isUser = m.role === "user";
                const streaming = busy && i === messages.length - 1 && m.role === "assistant";
                return (
                  <div key={i} className={cx("flex gap-1.5", isUser ? "flex-row-reverse" : "flex-row")}>
                    <div
                      className={cx(
                        "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[7px] font-bold",
                        isUser ? "bg-[#1a1d27] text-white" : "bg-[#e8e9ff] text-[#4f52c8]",
                      )}
                      aria-hidden
                    >
                      {isUser ? "Y" : "K"}
                    </div>
                    <div className="min-w-0 max-w-[85%]">
                      {!isUser && m.tools && m.tools.length > 0 && (
                        <div className="mb-1 flex flex-wrap gap-1">
                          {m.tools.map((t, j) => (
                            <span key={`${t}-${j}`} className="inline-flex items-center gap-1 rounded-full bg-[#eceef5] px-1.5 py-0.5 text-[9px] text-[#5c6370]">
                              {streaming && j === m.tools!.length - 1 ? <Spinner className="h-2.5 w-2.5" /> : null}
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div
                        className={cx(
                          "rounded-2xl px-2.5 py-1.5 text-[12px] leading-relaxed",
                          isUser
                            ? "rounded-tr-sm bg-[#1a1d27] text-white"
                            : "rounded-tl-sm border border-[#e4e6ee] bg-white text-[#14161d] shadow-[0_1px_2px_rgba(15,18,28,0.04)]",
                        )}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        ) : m.content ? (
                          <AnswerBody text={m.content} onRound={openRound} />
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[#8b91a1]">
                            <Spinner className="text-[#4f52c8]" />
                            Thinking…
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {error && <p className="border-t border-bad/20 bg-bad-soft px-3 py-1.5 text-[11px] text-bad">{error}</p>}

            <form
              className="flex items-center gap-1.5 border-t border-line px-2.5 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(input);
              }}
            >
              <input
                ref={inputRef}
                className={`${field} h-8 flex-1 py-1 text-xs`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask…"
                disabled={busy}
                aria-label="Ask about this investor"
              />
              <button type="submit" className={`${btn.primary} h-8 px-2.5 text-xs`} disabled={busy || !input.trim()}>
                {busy ? <Spinner /> : "Send"}
              </button>
            </form>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "ask-fab pointer-events-auto relative z-50 flex h-14 items-center gap-2.5 rounded-full border-2 border-white/40 bg-accent px-4 text-base font-bold text-accent-ink shadow-[0_0_0_4px_rgba(154,155,255,0.25),0_16px_48px_rgba(154,155,255,0.55)] transition hover:scale-[1.03] hover:brightness-110",
          open && "border-white/20 bg-white text-black shadow-[0_12px_40px_rgba(0,0,0,0.45)]",
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={open ? "Close chat" : `Ask KYI about ${investorName}`}
      >
        <span
          className={cx(
            "grid h-9 w-9 place-items-center rounded-full text-xs font-bold",
            open ? "bg-black/10" : "bg-black/15",
          )}
          aria-hidden
        >
          {open ? "✕" : "KYI"}
        </span>
        <span className="pr-1.5 tracking-tight">{open ? "Close" : "Ask KYI"}</span>
        {!open && messages.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-black ring-2 ring-accent">
            {messages.filter((m) => m.role === "user").length}
          </span>
        )}
      </button>
    </div>
  );
}

function AnswerBody({ text, onRound }: { text: string; onRound: (id: string) => void }) {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return <span className="text-muted">…</span>;

  const blocks = cleaned.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const followUps: string[] = [];
  const body: string[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const looksLikeFollowUps =
      lines.length >= 1 &&
      lines.length <= 4 &&
      lines.every((l) => l.endsWith("?")) &&
      body.length > 0;
    if (looksLikeFollowUps) followUps.push(...lines);
    else body.push(block);
  }

  // Also peel trailing question lines from the last body block
  if (followUps.length === 0 && body.length > 0) {
    const last = body[body.length - 1].split("\n").map((l) => l.trim()).filter(Boolean);
    const qs: string[] = [];
    while (last.length && last[last.length - 1].endsWith("?") && qs.length < 3) {
      qs.unshift(last.pop()!);
    }
    if (qs.length >= 1 && last.length > 0) {
      body[body.length - 1] = last.join("\n");
      followUps.push(...qs);
    }
  }

  return (
    <div className="space-y-2">
      {body.map((block, i) => (
        <p key={i} className="whitespace-pre-wrap text-[12px] leading-[1.5] text-[#1a1d27]">
          <InlineRich text={block} onRound={onRound} />
        </p>
      ))}
      {followUps.length > 0 && (
        <div className="rounded-lg border border-[#e4e6ee] bg-[#f4f5f8] px-2.5 py-2">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#8b91a1]">Follow up</div>
          <ul className="space-y-1">
            {followUps.map((q) => (
              <li key={q} className="text-[11px] leading-snug text-[#3a3f4d]">
                <InlineRich text={q} onRound={onRound} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InlineRich({ text, onRound }: { text: string; onRound: (id: string) => void }) {
  const nodes: ReactNode[] = [];
  const re = /(\[round:([^\]]+)\]|(https?:\/\/[^\s)\]>]+)|(\*\*[^*]+\*\*))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    if (m[0].startsWith("[round:")) {
      const id = m[2];
      const short = id.length > 10 ? `${id.slice(0, 8)}…` : id;
      nodes.push(
        <button
          key={key++}
          type="button"
          onClick={() => onRound(id)}
          className="mx-0.5 inline-flex translate-y-0.5 align-baseline"
          title={`Open evidence for round ${id}`}
        >
          <Chip tone="good" className="cursor-pointer border border-good/20 hover:brightness-110">
            ↗ {short}
          </Chip>
        </button>,
      );
    } else if (m[0].startsWith("http")) {
      nodes.push(
        <a key={key++} href={m[0]} target="_blank" rel="noreferrer" className="font-medium text-[#4f52c8] underline-offset-2 hover:underline">
          source
        </a>,
      );
    } else {
      nodes.push(
        <strong key={key++} className="font-semibold text-[#14161d]">
          {m[0].slice(2, -2)}
        </strong>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(<span key={key++}>{text.slice(last)}</span>);
  return <>{nodes}</>;
}
