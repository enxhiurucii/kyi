import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { accountsEnabled, supabaseAnonKey, supabaseUrl } from "./config";

export async function createSupabaseServerClient() {
  if (!accountsEnabled()) {
    throw new Error("Supabase accounts are not configured.");
  }
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — proxy refreshes the session.
        }
      },
    },
  });
}
