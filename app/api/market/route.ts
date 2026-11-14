import { buildMarketReportFor, errorResponse, getProvider, parseThesis } from "@/lib/service";

// POST /api/market  { thesis, mode? }
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { thesis?: unknown; mode?: unknown } | null;
    const thesis = parseThesis(body?.thesis);
    if (!thesis) {
      return Response.json(
        { error: "Missing thesis — need sectors, stages, and/or regions.", code: "bad_request" },
        { status: 400 },
      );
    }
    const provider = getProvider(body?.mode);
    const report = await buildMarketReportFor(provider, thesis);
    return Response.json(report);
  } catch (e) {
    return errorResponse(e);
  }
}
