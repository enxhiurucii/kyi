import { connection } from "next/server";
import { importFounder, resolveProfileMode } from "@/lib/profiles/provider";
import { errorResponse } from "@/lib/service";

export async function POST(req: Request) {
  await connection();
  try {
    const body = (await req.json().catch(() => null)) as { id?: unknown; mode?: unknown } | null;
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (!id) return Response.json({ error: "Missing 'id'." }, { status: 400 });
    const mode = resolveProfileMode(body?.mode);
    const result = await importFounder(id, mode);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
