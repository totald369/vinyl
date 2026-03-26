/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let cachedServerClient: SupabaseClient<any> | null = null;

export function getSupabaseServerClient(): SupabaseClient<any> | null {
  if (!url) return null;

  // 서버 API에서는 서비스 키를 우선 사용 (없으면 anon fallback)
  const key = serviceRole || anon;
  if (!key) return null;

  if (cachedServerClient) return cachedServerClient;

  cachedServerClient = createClient<any>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return cachedServerClient;
}
