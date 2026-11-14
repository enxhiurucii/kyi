import { buildCompanyReportFor, errorResponse, getProvider, parseThesis } from "@/lib/service";

// POST /api/company  { company, thesis?, mode? }
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      company?: unknown;
      thesis?: unknown;
      mode?: unknown;
    } | null;
    const company = typeof body?.company === "string" ? body.company.trim() : "";
    if (!company) return Response.json({ error: "Missing 'company'." }, { status: 400 });
    const provider = getProvider(body?.mode);
    const thesis = parseThesis(body?.thesis);
    const report = await buildCompanyReportFor(provider, company, thesis);
    if (!report) {
      return Response.json(
        {
          error: `No company called "${company}" found${provider.mode === "demo" ? " in the demo data" : " in Cala"}.`,
          code: "not_found",
        },
        { status: 404 },
      );
    }
    return Response.json(report);
  } catch (e) {
    return errorResponse(e);
  }
}
