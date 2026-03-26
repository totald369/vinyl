import { NextResponse } from "next/server";
import { validateAndNormalizeReport } from "@/lib/reports";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const validated = validateAndNormalizeReport(json);

    if (!validated.ok) {
      return NextResponse.json({ success: false, error: validated.error }, { status: 400 });
    }

    const client = getSupabaseServerClient();
    if (!client) {
      console.error("[api/report] Supabase env is missing");
      return NextResponse.json(
        { success: false, error: "서버 환경설정이 올바르지 않습니다." },
        { status: 500 }
      );
    }

    const { data, error } = await client
      .from("reports")
      .insert(validated.data)
      .select("id,status,created_at")
      .single();

    if (error) {
      console.error("[api/report] insert failed", {
        message: error.message,
        code: error.code,
        details: error.details
      });
      return NextResponse.json(
        { success: false, error: "제보 등록 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, report: data }, { status: 201 });
  } catch (error) {
    console.error("[api/report] unexpected error", error);
    return NextResponse.json(
      { success: false, error: "요청 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
