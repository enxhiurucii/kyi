import { connection } from "next/server";
import type { MeResponse } from "@/lib/auth/types";
import { isVerifiedFounder } from "@/lib/auth/verify";
import {
  companyFromRow,
  founderFromRow,
  type CompanyRow,
  type FounderRow,
} from "@/lib/profiles/map";
import { accountsEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  await connection();

  if (!accountsEnabled()) {
    const body: MeResponse = {
      accountsEnabled: false,
      user: null,
      founder: null,
      company: null,
      verifiedFounder: false,
    };
    return Response.json(body);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const body: MeResponse = {
        accountsEnabled: true,
        user: null,
        founder: null,
        company: null,
        verifiedFounder: false,
      };
      return Response.json(body);
    }

    const [{ data: founderRow }, { data: companyRow }] = await Promise.all([
      supabase.from("founders").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("companies").select("*").eq("owner_id", user.id).maybeSingle(),
    ]);

    const founder = founderRow ? founderFromRow(founderRow as FounderRow) : null;
    const company = companyRow ? companyFromRow(companyRow as CompanyRow) : null;
    const email = user.email ?? null;
    const metaName =
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : null;

    const body: MeResponse = {
      accountsEnabled: true,
      user: {
        id: user.id,
        email,
        fullName: founder?.fullName ?? metaName,
        isAnonymous: Boolean(user.is_anonymous),
      },
      founder,
      company,
      verifiedFounder: isVerifiedFounder(email, company),
    };
    return Response.json(body);
  } catch (e) {
    console.error(e);
    return Response.json(
      { accountsEnabled: true, user: null, founder: null, company: null, verifiedFounder: false, error: "session_error" },
      { status: 200 },
    );
  }
}
