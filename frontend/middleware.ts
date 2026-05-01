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
  if (host === SITE_APEX_HOST) {
    const url = request.nextUrl.clone();
    url.hostname = SITE_CANONICAL_HOST;
    url.protocol = "https:";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/data/")) {
    return NextResponse.next();
  }
  const file = pathname.slice("/data/".length).split("/").pop() ?? "";
  if (BLOCKED_DATA_FILES.has(file)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.next();
}

/** 정적 에셋은 제외, 그 외(HTML·robots·sitemap·/data 포함) apex 리다이렉트 가능 */
export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)"
};
