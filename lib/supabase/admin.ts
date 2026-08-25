import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/config";

export class SupabaseAdminConfigError extends Error {
  readonly code = "supabase_admin_config";

  constructor() {
    super("SUPABASE_SECRET_KEY sunucu değişkeni yapılandırılmamış.");
    this.name = "SupabaseAdminConfigError";
  }
}

export function createAdminClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";

  if (!config || !secretKey) {
    return null;
  }

  return createClient(config.url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function requireAdminClient(): SupabaseClient {
  const client = createAdminClient();
  if (!client) throw new SupabaseAdminConfigError();
  return client;
}
