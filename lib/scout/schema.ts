import { z } from "zod";

/** Unified PLAN item — works for both founder (investors) and investor (startups) modes. */
export const ScoutPlanItemSchema = z.object({
  name: z.string().min(1),
  id: z.string().optional(),
  score: z.number().min(0).max(100),
  why: z.array(z.string()).min(1),
  evidenceRoundIds: z.array(z.string()).default([]),
  risk: z.string().optional(),
  draftMessage: z.string().max(900).optional(),
});

export const ScoutPlanSchema = z.object({
  summary: z.string().optional(),
  for: z.enum(["founder", "investor"]).optional(),
  items: z.array(ScoutPlanItemSchema).min(1).max(8),
});

export type ScoutPlan = z.infer<typeof ScoutPlanSchema>;
export type ScoutPlanItem = z.infer<typeof ScoutPlanItemSchema>;

/** Accept new `items` shape or legacy `top` investor fields from older prompts. */
export function normalizeScoutPlan(raw: unknown): ScoutPlan | null {
  const parsed = ScoutPlanSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (Array.isArray(o.top)) {
    const items = o.top.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        name: String(r.name ?? r.investor ?? ""),
        id: typeof r.id === "string" ? r.id : typeof r.investorId === "string" ? r.investorId : undefined,
        score: typeof r.score === "number" ? r.score : typeof r.fitScore === "number" ? r.fitScore : 0,
        why: Array.isArray(r.why) ? r.why.map(String) : ["No reason given"],
        evidenceRoundIds: Array.isArray(r.evidenceRoundIds) ? r.evidenceRoundIds.map(String) : [],
        risk:
          typeof r.risk === "string"
            ? r.risk
            : r.conflict && typeof r.conflict === "object"
              ? `Conflict: ${(r.conflict as { companyName?: string }).companyName ?? "portfolio"}`
              : undefined,
        draftMessage:
          typeof r.draftMessage === "string"
            ? r.draftMessage
            : typeof r.draftEmail === "string"
              ? r.draftEmail
              : undefined,
      };
    });
    const again = ScoutPlanSchema.safeParse({ summary: o.summary, for: o.for, items });
    return again.success ? again.data : null;
  }
  return null;
}

export function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
}
