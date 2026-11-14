import { parseOwnCompany } from "@/lib/profiles/parse";
import { buildInvestorReport, errorResponse, getProvider, parseStartup } from "@/lib/service";

// POST /api/report  { investor, startup?, company?, mode?, depth? }
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      investor?: unknown;
      startup?: unknown;
      company?: unknown;
      mode?: unknown;
      depth?: unknown;
    } | null;
    const investor = typeof body?.investor === "string" ? body.investor.trim() : "";
    if (!investor) return Response.json({ error: "Missing 'investor'." }, { status: 400 });
    const provider = getProvider(body?.mode);
    const report = await buildInvestorReport(
      provider,
      investor,
      parseStartup(body?.startup),
      body?.depth === "quick" ? "quick" : "full",
      parseOwnCompany(body?.company),
    );
    if (!report) {
      return Response.json({ error: `No investor called "${investor}" found${provider.mode === "demo" ? " in the demo data" : " in Cala"}.`, code: "not_found" }, { status: 404 });
    }
    return Response.json(report);
  } catch (e) {
    return errorResponse(e);
  }
}
