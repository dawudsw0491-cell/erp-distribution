import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!url || !secret) {
    throw new Error("Supabase Admin environment configuration is missing.");
  }

  adminClient = createClient(url, secret, {
    // Secret API keys reject requests that identify themselves as browser traffic.
    // This client is server-only, so identify outbound requests explicitly.
    global: {
      headers: {
        "User-Agent": "HEXA-CORE-Server/1.0",
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return adminClient;
}
