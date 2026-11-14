import { connection, type NextRequest } from "next/server";
import { newCtx } from "@/lib/provider";
import { errorResponse, getProvider } from "@/lib/service";

// GET /api/investors/search?q=lifeline&mode=cala|demo → autocomplete for investor names
export async function GET(req: NextRequest) {
  await connection(); // request-time only (reads the query string)
  try {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const provider = getProvider(req.nextUrl.searchParams.get("mode") ?? undefined);
    const results = await provider.searchInvestors(q, newCtx());
    return Response.json({ dataMode: provider.mode, results });
  } catch (e) {
    return errorResponse(e);
  }
}
