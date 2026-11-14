import { connection } from "next/server";
import { enrichIncomingDemo, mutualMatch, thesisFromInvestorProfile } from "@/lib/interests/enrich";
import type { IncomingInterest, InterestRecord } from "@/lib/interests/types";
import { DEMO_LUMIPOLKU_NAME, DEMO_MIKKO_ID, DEMO_SISU_FIRM } from "@/lib/interests/types";
import { companyFromRow, investorFromRow, type CompanyRow, type InvestorProfileRow } from "@/lib/profiles/map";
import type { CompanyProfile } from "@/lib/profiles/types";
import { buildInvestorReport, errorResponse, getProvider, parseStartup } from "@/lib/service";
import { scoreThesisFit } from "@/lib/market";
import { newCtx } from "@/lib/provider";
import { accountsEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Stage, Startup } from "@/lib/types";

function reportPath(investor: string, s: Startup, mode: string): string {
  const p = new URLSearchParams({ d: s.description, s: s.stage, c: s.country, mode, inv: investor });
  return `/report?${p}`;
}

/**
 * GET ?view=incoming — founder: interests in my company (enriched)
 * GET ?view=mine — investor: my expressed interests
 * GET ?companyName=… — whether current investor already expressed (demo helper via header not needed)
 *
 * POST { companyId?, companyName, message?, companyStage?, mode? }
 *   — Express interest. Live: requires auth + discoverable company. Demo: returns a demo record (client also stores locally).
 */
export async function GET(req: Request) {
  await connection();
  try {
    const url = new URL(req.url);
    const view = url.searchParams.get("view") ?? "incoming";
    const companyName = url.searchParams.get("companyName") ?? "";
    const mode = url.searchParams.get("mode") === "cala" ? "cala" : "demo";

    // Demo enrichment endpoint: client sends local rows via POST /enrich — for GET demo, return empty cloud list.
    if (!accountsEnabled()) {
      return Response.json({ interests: [] as IncomingInterest[], accountsEnabled: false });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ interests: [], accountsEnabled: true, user: null });
    }

    if (view === "mine") {
      const { data, error } = await supabase
        .from("interests")
        .select("id, investor_user_id, company_id, message, created_at, companies(id, name, stage, discoverable)")
        .eq("investor_user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const interests: InterestRecord[] = (data ?? []).map((row) => {
        const co = row.companies as unknown as { id: string; name: string; stage: string; discoverable: boolean } | null;
        return {
          id: row.id as string,
          companyId: row.company_id as string,
          companyName: co?.name ?? "Company",
          companyStage: (co?.stage as Stage) ?? undefined,
          investorUserId: row.investor_user_id as string,
          investorName: "",
          investorFirm: "",
          message: (row.message as string | null) ?? undefined,
          createdAt: row.created_at as string,
          source: "cloud" as const,
        };
      });
      return Response.json({ interests, accountsEnabled: true });
    }

    // incoming for founder
    const { data: companyRow } = await supabase.from("companies").select("*").eq("owner_id", user.id).maybeSingle();
    if (!companyRow) {
      return Response.json({ interests: [], accountsEnabled: true });
    }
    const company = companyFromRow(companyRow as CompanyRow);
    if (!company.discoverable) {
      // Privacy: non-discoverable companies never surface to investors; founder still shouldn't expect inbound.
      return Response.json({ interests: [], accountsEnabled: true, discoverable: false });
    }

    const { data: rows, error } = await supabase
      .from("interests")
      .select("id, investor_user_id, company_id, message, created_at")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const startup: Startup = {
      description: company.oneLiner || company.name,
      stage: company.stage,
      country: company.country,
    };
    const provider = getProvider(mode);

    const interests: IncomingInterest[] = [];
    for (const row of rows ?? []) {
      const { data: invRow } = await supabase
        .from("investor_profiles")
        .select("*")
        .eq("id", row.investor_user_id)
        .maybeSingle();
      const inv = invRow ? investorFromRow(invRow as InvestorProfileRow) : null;
      const firm = inv?.firmName || inv?.fullName || "Investor";
      const report = await buildInvestorReport(provider, firm, startup, "quick", {
        name: company.name,
        entityId: company.calaCompanyId,
      });
      const fitScore = report?.fitScore?.score ?? null;

      let thesisFitScore: number | null = null;
      if (inv) {
        const thesis = thesisFromInvestorProfile(inv);
        // Prefer live company graph when possible; fall back to profile fields as a Company-like stub.
        try {
          const profile = await provider.getCompanyProfile(company.calaCompanyId || company.name, newCtx());
          if (profile) {
            thesisFitScore = scoreThesisFit(profile.company, profile.rounds[0] ?? null, thesis).score;
          }
        } catch {
          /* ignore */
        }
        if (thesisFitScore == null) {
          const stub = {
            id: company.id ?? company.name,
            name: company.name,
            description: company.oneLiner,
            country: company.country,
            sectors: company.sectors,
            foundedYear: company.foundedYear,
            status: undefined as string | undefined,
          };
          thesisFitScore = scoreThesisFit(stub, null, thesis).score;
        }
      }

      interests.push({
        id: row.id as string,
        companyId: row.company_id as string,
        companyName: company.name,
        companyStage: company.stage,
        investorUserId: row.investor_user_id as string,
        investorName: inv?.fullName ?? "",
        investorFirm: firm,
        message: (row.message as string | null) ?? undefined,
        createdAt: row.created_at as string,
        source: "cloud",
        fitScore,
        thesisFitScore,
        mutualMatch: mutualMatch(fitScore, thesisFitScore),
        reportHref: reportPath(firm, startup, mode),
      });
    }

    // Optional: also accept demo local rows aren't available server-side.
    void companyName;
    return Response.json({ interests, accountsEnabled: true, discoverable: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  await connection();
  try {
    const body = (await req.json().catch(() => null)) as {
      companyId?: unknown;
      companyName?: unknown;
      message?: unknown;
      companyStage?: unknown;
      mode?: unknown;
      /** Demo-only: client asks server to enrich a batch of local interests for founder view */
      enrichLocal?: unknown;
      localInterests?: unknown;
      startup?: unknown;
      company?: unknown;
    } | null;

    // Enrich path for demo founder card (localStorage rows → scored IncomingInterest[])
    if (body?.enrichLocal === true && Array.isArray(body.localInterests)) {
      const company = (body.company && typeof body.company === "object" ? body.company : null) as CompanyProfile | null;
      const startup = parseStartup(body.startup);
      const rows = body.localInterests as InterestRecord[];
      const interests = await enrichIncomingDemo(rows, company, startup);
      return Response.json({ interests });
    }

    const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
    const companyIdHint = typeof body?.companyId === "string" ? body.companyId.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim().slice(0, 500) : undefined;
    const companyStage =
      typeof body?.companyStage === "string" ? (body.companyStage as Stage) : undefined;

    if (!companyName && !companyIdHint) {
      return Response.json({ error: "Pick a company." }, { status: 400 });
    }

    // Demo / no accounts: return a synthetic record; client persists via localStore.
    if (!accountsEnabled()) {
      const record: InterestRecord = {
        id: crypto.randomUUID(),
        companyId: companyIdHint || "demo-company-lumipolku",
        companyName: companyName || DEMO_LUMIPOLKU_NAME,
        companyStage: companyStage ?? "seed",
        investorUserId: DEMO_MIKKO_ID,
        investorName: "Mikko",
        investorFirm: DEMO_SISU_FIRM,
        message,
        createdAt: new Date().toISOString(),
        source: "demo",
      };
      return Response.json({ interest: record, accountsEnabled: false });
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "Sign in as an investor to express interest.", code: "auth" }, { status: 401 });
    }

    // Resolve discoverable company only — never leak non-discoverable founders.
    let companyQuery = supabase.from("companies").select("*").eq("discoverable", true);
    if (companyIdHint && !companyIdHint.startsWith("demo-")) {
      companyQuery = companyQuery.eq("id", companyIdHint);
    } else if (companyName) {
      companyQuery = companyQuery.ilike("name", companyName);
    } else {
      return Response.json({ error: "Company not found or not discoverable." }, { status: 404 });
    }
    const { data: co, error: coErr } = await companyQuery.maybeSingle();
    if (coErr) throw coErr;
    if (!co) {
      return Response.json({ error: "Company not found or not discoverable." }, { status: 404 });
    }
    const company = companyFromRow(co as CompanyRow);
    if (company.id && (co as CompanyRow).owner_id === user.id) {
      return Response.json({ error: "You cannot express interest in your own company." }, { status: 400 });
    }

    const { data: invRow } = await supabase.from("investor_profiles").select("*").eq("id", user.id).maybeSingle();
    if (!invRow) {
      return Response.json({ error: "Complete your investor profile first." }, { status: 400 });
    }
    const inv = investorFromRow(invRow as InvestorProfileRow);

    const { data: inserted, error } = await supabase
      .from("interests")
      .upsert(
        {
          investor_user_id: user.id,
          company_id: (co as CompanyRow).id,
          message: message || null,
        },
        { onConflict: "investor_user_id,company_id" },
      )
      .select("id, investor_user_id, company_id, message, created_at")
      .single();
    if (error) throw error;

    const record: InterestRecord = {
      id: inserted.id as string,
      companyId: inserted.company_id as string,
      companyName: company.name,
      companyStage: company.stage,
      investorUserId: user.id,
      investorName: inv.fullName,
      investorFirm: inv.firmName || inv.fullName,
      message: (inserted.message as string | null) ?? undefined,
      createdAt: inserted.created_at as string,
      source: "cloud",
    };
    return Response.json({ interest: record, accountsEnabled: true });
  } catch (e) {
    return errorResponse(e);
  }
}
