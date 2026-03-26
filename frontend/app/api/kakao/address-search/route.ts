import { NextResponse } from "next/server";
import { searchAddressByKakao } from "@/lib/kakao/addressSearch";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json(
      { success: false, error: "검색어는 2자 이상 입력해주세요.", results: [] },
      { status: 400 }
    );
  }

  try {
    const results = await searchAddressByKakao(query, { size: 8 });
    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("[api/kakao/address-search] search failed", error);
    return NextResponse.json(
      { success: false, error: "주소 검색 중 오류가 발생했습니다.", results: [] },
      { status: 500 }
    );
  }
}

