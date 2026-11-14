"use client";

import { createBrowserClient } from "@supabase/ssr";
import { accountsEnabled, supabaseAnonKey, supabaseUrl } from "./config";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createSupabaseBrowserClient() {
  if (!accountsEnabled()) {
    throw new Error("Supabase accounts are not configured.");
  }
  if (!client) {
    client = createBrowserClient(supabaseUrl(), supabaseAnonKey());
  }
  return client;
}
