import { newCtx } from "@/lib/provider";
import { errorResponse, getProvider } from "@/lib/service";
import type { Round } from "@/lib/types";

// POST /api/sources  { round: Round, mode?: "cala"|"demo" } → citations for one funding round
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { round?: Round; mode?: unknown } | null;
    const round = body?.round;
    if (!round || typeof round.companyName !== "string") return Response.json({ error: "Missing 'round'." }, { status: 400 });
    const provider = getProvider(body?.mode);
    const ctx = newCtx();
    const result = await provider.getSources(
      { ...round, sources: Array.isArray(round.sources) ? round.sources : [], investors: Array.isArray(round.investors) ? round.investors : [] },
      ctx,
    );
    return Response.json({ ...result, queries: ctx.queries });
  } catch (e) {
    return errorResponse(e);
  }
}
