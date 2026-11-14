import { connection, type NextRequest } from "next/server";
import { resolveProfileMode, searchPeople } from "@/lib/profiles/provider";
import { errorResponse } from "@/lib/service";

export async function GET(req: NextRequest) {
  await connection();
  try {
    const q = req.nextUrl.searchParams.get("q") ?? "";
    const mode = resolveProfileMode(req.nextUrl.searchParams.get("mode") ?? undefined);
    const { results, mode: dataMode } = await searchPeople(q, mode);
    return Response.json({ dataMode, results });
  } catch (e) {
    return errorResponse(e);
  }
}
