import { parseOwnCompany } from "@/lib/profiles/parse";
import { errorResponse, getProvider, parseStartup, rankInvestors } from "@/lib/service";

const MAX_INVESTORS = 25;

// POST /api/rank  { investors, startup, company?, mode?, depth? }
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      investors?: unknown;
      startup?: unknown;
      company?: unknown;
      mode?: unknown;
      depth?: unknown;
    } | null;
    const startup = parseStartup(body?.startup);
    if (!startup) return Response.json({ error: "Describe your startup in one line first." }, { status: 400 });
    const names = Array.isArray(body?.investors)
      ? [...new Set(body.investors.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))]
      : [];
    if (names.length === 0) return Response.json({ error: "Add at least one investor." }, { status: 400 });
    if (names.length > MAX_INVESTORS) return Response.json({ error: `Up to ${MAX_INVESTORS} investors at a time.` }, { status: 400 });
    const provider = getProvider(body?.mode);
    const ownCompany = parseOwnCompany(body?.company);
    return Response.json(await rankInvestors(provider, names, startup, body?.depth === "full" ? "full" : "quick", ownCompany));
  } catch (e) {
    return errorResponse(e);
  }
}
