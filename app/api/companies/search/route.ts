import { connection, type NextRequest } from "next/server";
import { newCtx } from "@/lib/provider";
import { errorResponse, getProvider } from "@/lib/service";

export async function GET(req: NextRequest) {
  await connection();
  try {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const provider = getProvider(req.nextUrl.searchParams.get("mode") ?? undefined);
    const results = await provider.searchCompanies(q, newCtx());
    return Response.json({ dataMode: provider.mode, results });
  } catch (e) {
    return errorResponse(e);
  }
}
