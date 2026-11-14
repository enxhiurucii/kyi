import { NextResponse } from "next/server";
import { accountsEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") || "/onboarding";
  const origin = url.origin;

  if (!accountsEnabled()) {
    return NextResponse.redirect(`${origin}/`);
  }

  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const safe = next.startsWith("/") ? next : "/onboarding";
      return NextResponse.redirect(`${origin}${safe}`);
    }
  }

  return NextResponse.redirect(`${origin}/signin?error=auth`);
}
