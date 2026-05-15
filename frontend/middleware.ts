import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SITE_APEX_HOST, SITE_CANONICAL_HOST } from "@/lib/site";

/** 브라우저로 직접 JSON을 대량 수집하기 어렵게 — API만 사용하도록 */
const BLOCKED_DATA_FILES = new Set([
  "stores.sample.json",
  "stores.gunpo.json",
  "stores.goyang.json",
  "stores.goyang-sticker.json",
  "stores.bucheon-gbms.json",
  "stores.busan-namgu-trash.json",
  "stores.busan-junggu-trash.json",
  "stores.busan-junggu-pp.json",
  "stores.busan-donggu-trash.json",
  "stores.busan-dongnae-trash.json",
  "stores.busan-geumjeong-trash.json",
  "stores.busan-geumjeong-special.json",
  "stores.busan-bukgu-trash.json",
  "stores.busan-bukgu-special.json",
  "stores.busan-sasang-trash.json",
  "stores.busan-sasang-special.json",
  "stores.busan-haeundae-trash.json",
  "stores.busan-yeongdo-trash.json",
  "stores.gyeonggi-gwangju-findstore.json",
  "stores.gwangju-trash-lifeinsights.json",
  "stores.daegu-buk-dalseo-trash.json",
  "stores.incheon-michuhol-trash.json",
  "stores.incheon-yeonsu-trash-sticker.json",
  "stores.incheon-namdong-trash.json",
  "stores.incheon-bupyeong-trash-sticker-special.json",
  "stores.incheon-gyeyang-gbms.json",
  "stores.gyeonggi-siheung-trash.json",
  "stores.daejeon-donggu-trash.json",
  "stores.daejeon-yuseong-trash.json",
  "stores.daejeon-daedeok-trash.json",
  "stores.gangwon-wonju-trash.json",
  "stores.gangwon-taebaek-trash.json",
  "stores.ulsan-donggu-trash.json",
  "stores.chungbuk-chungju-trash.json",
  "stores.chungbuk-cheongju-trash.json",
  "stores.chungbuk-jeungpyeong-trash.json",
  "reports_rows.json",
  "_merged_cache.json"
]);

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  const { pathname } = request.nextUrl;
  const vercelEnv = process.env.VERCEL_ENV;

  /** 비-www apex → 선호 호스트 정규화 */
  if (host === SITE_APEX_HOST) {
    const url = request.nextUrl.clone();
    url.hostname = SITE_CANONICAL_HOST;
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  /**
   * 프로덕션에서 기본 .vercel.app 호스트로 열리면 canonical(사용자 도메인)과 중복 색인·리다이렉트 이슈가 납니다.
   * Preview(`VERCEL_ENV=preview`)는 QA용이므로 리다이렉트하지 않고 noindex만 붙입니다.
   */
  if (host?.endsWith(".vercel.app") && vercelEnv === "production") {
    const url = request.nextUrl.clone();
    url.hostname = SITE_CANONICAL_HOST;
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  if (pathname.startsWith("/data/")) {
    const file = pathname.slice("/data/".length).split("/").pop() ?? "";
    if (BLOCKED_DATA_FILES.has(file)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  }

  const res = NextResponse.next();
  if (host?.endsWith(".vercel.app") && vercelEnv === "preview") {
    res.headers.set("X-Robots-Tag", "noindex");
  }
  return res;
}

/**
 * 변경 전: 광매처(/Img/*)·robots·sitemap까지 미들웨어가 실행되어 엣지 지연 발생.
 * 변경 후: 정적·메타 라우트는 스킵 — 엣지 CPU·cold path 지연 최소화.
 */
export const config = {
  matcher:
    "/((?!_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|img/|Img/).*)"
};
