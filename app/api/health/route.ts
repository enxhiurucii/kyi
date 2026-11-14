import { connection } from "next/server";
import { calaConfigured } from "@/lib/cala/client";
import { defaultMode } from "@/lib/service";

// GET /api/health → which data source is available (used by the UI's data-mode switch)
export async function GET() {
  await connection(); // evaluate per request, not at build time
  return Response.json({
    defaultMode: defaultMode(),
    calaConfigured: calaConfigured(),
    aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
