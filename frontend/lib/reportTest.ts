import { getBrowserSupabaseClient } from "@/lib/supabase";

export async function insertSampleReport() {
  const client = getBrowserSupabaseClient();
  if (!client) {
    console.log("data:", null);
    console.log("error:", "Supabase env is missing");
    return { data: null, error: new Error("Supabase env is missing") };
  }

  const { data, error } = await client
    .from("reports")
    .insert({
      report_type: "new_store",
      name: "테스트 매장",
      road_address: "서울 강남구 테스트로 123",
      has_trash_bag: true
    })
    .select()
    .single();

  console.log("data:", data);
  console.log("error:", error);
  return { data, error };
}

