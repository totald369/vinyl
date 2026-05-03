import type { NextRequest } from "next/server";

const WINDOW_MS = 60_000;
/** 단일 사용자 세션에서 목록·검색·디테일·프리패치가 겹치면 초과하기 쉬움 → 완만히 상향 */
const MAX_REQUESTS = 120;

/** IP별 슬라이딩 윈도 카운터 (서버리스 인스턴스마다 독립 — 난이도 상승용) */
const rateBuckets = new Map<string, { t: number; n: number }>();

function getClientIp(request: NextRequest): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

function hostAllowed(host: string): boolean {
  const h = host.split(":")[0]?.toLowerCase() ?? "";
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h === "trashbagmap.com" || h === "www.trashbagmap.com") return true;
  if (h.endsWith(".vercel.app")) return true;
  return false;
}

/**
 * 브라우저 등 정상 클라이언트만 허용 (same-origin fetch는 Referer가 붙는 경우가 많음)
 */
export function checkReferer(request: NextRequest): { ok: true } | { ok: false; reason: string } {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin" || secFetchSite === "same-site") {
    return { ok: true };
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const u = new URL(origin);
      if (hostAllowed(u.hostname)) {
        return { ok: true };
      }
    } catch {
      /* ignore */
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const u = new URL(referer);
      if (hostAllowed(u.hostname)) {
        return { ok: true };
      }
      // Some clients send a cross-site navigation referer; same-origin fetch should still target our Host.
    } catch {
      return { ok: false, reason: "referer_parse" };
    }
  }

  const reqHost = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";
  if (reqHost && hostAllowed(reqHost)) {
    return { ok: true };
  }

  return { ok: false, reason: "missing_referer" };
}

export function checkRateLimit(ip: string): { ok: true } | { ok: false } {
  const now = Date.now();
  const b = rateBuckets.get(ip);
  if (!b || now - b.t > WINDOW_MS) {
    rateBuckets.set(ip, { t: now, n: 1 });
    return { ok: true };
  }
  if (b.n >= MAX_REQUESTS) {
    return { ok: false };
  }
  b.n += 1;
  return { ok: true };
}

const BLOCKED_UA =
  /curl|wget|python-requests|aiohttp|axios\/|node-fetch|go-http|scrapy|httpclient|java\/|libwww|httpunit|spider|crawler|^$/i;

export function checkUserAgent(request: NextRequest): { ok: true } | { ok: false } {
  const ua = request.headers.get("user-agent") ?? "";
  if (BLOCKED_UA.test(ua.trim())) {
    return { ok: false };
  }
  return { ok: true };
}

export { getClientIp };
