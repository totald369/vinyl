import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { SITE_APEX_HOST, SITE_CANONICAL_HOST } from "@/lib/site";

/** 브라우저로 직접 JSON을 대량 수집하기 어렵게 — API만 사용하도록 */
const BLOCKED_DATA_FILES = new Set([
  "stores.sample.json",
  "stores.gunpo.json",
  "stores.goyang.json",
  "stores.goyang-sticker.json",
  "reports_rows.json"
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

/** 정적 에셋은 제외, 그 외(HTML·robots·sitemap·/data 포함) apex 리다이렉트 가능 */
export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)"
};
