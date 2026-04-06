import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** 브라우저로 직접 JSON을 대량 수집하기 어렵게 — API만 사용하도록 */
const BLOCKED_DATA_FILES = new Set([
  "stores.sample.json",
  "stores.gunpo.json",
  "stores.goyang.json",
  "stores.goyang-sticker.json",
  "reports_rows.json"
]);

export function middleware(request: NextRequest) {
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

export const config = {
  matcher: "/data/:path*"
};
