/* eslint-disable @typescript-eslint/no-explicit-any -- generated Database 타입 없이 insert 사용 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** 스키마 타입 미생성 시 `ReturnType<typeof createClient>` 추론이 깨져 insert가 `never`가 되는 것을 방지 */
let cachedClient: SupabaseClient<any> | null = null;

export function getSupabaseClient(): SupabaseClient<any> | null {
  if (!url || !anon) {
    return null;
  }

  if (cachedClient) {
    return cachedClient;
  }

  cachedClient = createClient<any>(url, anon, {
    auth: {
      persistSession: false
    }
  });

  return cachedClient;
}
