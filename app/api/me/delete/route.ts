import { connection } from "next/server";
import { accountsEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Delete founder, company, lists, items for the signed-in user (RLS). Does not delete auth.users. */
export async function POST() {
  await connection();
  if (!accountsEnabled()) {
    return Response.json({ error: "Accounts not configured." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  await supabase.from("watchlist_items").delete().eq("user_id", user.id);
  await supabase.from("investor_profiles").delete().eq("id", user.id);
  const { error: cErr } = await supabase.from("companies").delete().eq("owner_id", user.id);
  if (cErr) return Response.json({ error: cErr.message }, { status: 500 });
  const { error: fErr } = await supabase.from("founders").delete().eq("id", user.id);
  if (fErr) return Response.json({ error: fErr.message }, { status: 500 });

  await supabase.auth.signOut();
  return Response.json({ ok: true });
}
