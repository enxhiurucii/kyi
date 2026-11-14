import type { InvestorReport, Round } from "../types";

/** Compact report JSON for the Ask system prompt (keeps tokens down, keeps citations). */
export function reportAskContext(r: InvestorReport) {
  const rounds = Object.values(r.rounds).map(compactRound);
  return {
    investor: {
      id: r.investor.id,
      name: r.investor.name,
      kind: r.investor.kind,
      country: r.investor.country,
      description: r.investor.description,
    },
    activity: r.activity,
    leadership: r.leadership,
    followOn: {
      rate: r.followOn.rate,
      followed: r.followOn.followed,
      eligible: r.followOn.eligible,
      companies: r.followOn.companies.map((c) => ({
        companyName: c.companyName,
        yes: c.yes,
        roundIds: c.roundIds,
      })),
    },
    graduation: {
      rate: r.graduation.rate,
      graduated: r.graduation.graduated,
      eligible: r.graduation.eligible,
      companies: r.graduation.companies.map((c) => ({
        companyName: c.companyName,
        yes: c.yes,
        roundIds: c.roundIds,
      })),
    },
    fit: r.fit,
    fitScore: r.fitScore,
    coInvestors: r.coInvestors,
    conflicts: r.conflicts,
    talkingPoints: r.talkingPoints,
    rounds,
    dataMode: r.dataMode,
  };
}

function compactRound(round: Round) {
  return {
    id: round.id,
    date: round.date,
    companyName: round.companyName,
    stageLabel: round.stageLabel,
    amountLabel: round.amountLabel,
    investors: round.investors.map((p) => ({ name: p.investorName, isLead: p.isLead })),
    sourceUrl: round.sources.find((s) => s.url)?.url ?? null,
  };
}

export function buildAskSystemPrompt(reportJson: string): string {
  return `You are KYI's investor analyst. Answer ONLY from the REPORT JSON below and tool results.
Cite every fact as [round:<id>] or a source URL. If the data doesn't say, answer: Cala's data doesn't show this.
Never guess. No investment advice. Max 120 words unless asked for an email. End with 2 short follow-up questions.

REPORT JSON:
${reportJson}`;
}
