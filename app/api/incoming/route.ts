import { buildCompanyBrief, errorResponse, getProvider } from "@/lib/service";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { company?: unknown; fund?: unknown; mode?: unknown } | null;
    const company = typeof body?.company === "string" ? body.company.trim() : "";
    if (!company) return Response.json({ error: "Missing 'company'." }, { status: 400 });
    const fund = typeof body?.fund === "string" ? body.fund.trim() : "";
    const provider = getProvider(body?.mode);
    const brief = await buildCompanyBrief(provider, company, fund || null);
    if (!brief) {
      return Response.json(
        { error: `No company called "${company}" found${provider.mode === "demo" ? " in the demo data" : " in Cala"}.`, code: "not_found" },
        { status: 404 },
      );
    }
    return Response.json(brief);
  } catch (e) {
    return errorResponse(e);
  }
}
