import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { accountsEnabled, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config";

/** Refresh the auth session cookie only — no redirects. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!accountsEnabled()) return response;

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Touches the session so expired tokens refresh into the response cookies.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    /*
     * Skip static assets and Next internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
