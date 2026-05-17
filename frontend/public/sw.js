/* eslint-disable no-restricted-globals */
/**
 * 카카오 지도 타일·배경 타일 장기 캐시 (서버 Cache-Control 6h 보완).
 * HD(2x) URL 은 1x 로 정규화해 저장·요청.
 */
const TILE_CACHE = "kakao-tiles-v1";
const TILE_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

function isKakaoTileRequest(url) {
  if (url.hostname === "mts.daumcdn.net" && url.pathname.includes("/tile/")) {
    return true;
  }
  if (url.hostname === "t1.daumcdn.net" && url.pathname.includes("bg_tile")) {
    return true;
  }
  return false;
}

/** `.../2x/bg_tile.png` → `.../bg_tile.png` */
function normalizeKakaoTileUrl(requestUrl) {
  const url = new URL(requestUrl);
  if (url.hostname === "t1.daumcdn.net" && url.pathname.includes("/2x/")) {
    url.pathname = url.pathname.replace(/\/2x\//g, "/");
    return url.toString();
  }
  return requestUrl;
}

function cacheIsFresh(response) {
  const cachedAt = response.headers.get("sw-cached-at");
  if (!cachedAt) return false;
  const age = Date.now() - Date.parse(cachedAt);
  return Number.isFinite(age) && age >= 0 && age < TILE_CACHE_MS;
}

async function cachePut(cache, request, response) {
  const headers = new Headers(response.headers);
  headers.set("sw-cached-at", new Date().toISOString());
  const body = await response.clone().blob();
  await cache.put(
    request,
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("kakao-tiles-") && name !== TILE_CACHE)
          .map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !isKakaoTileRequest(url)) {
    return;
  }

  const normalizedUrl = normalizeKakaoTileUrl(event.request.url);
  const cacheRequest =
    normalizedUrl === event.request.url
      ? event.request
      : new Request(normalizedUrl, { method: "GET", mode: "cors", credentials: "omit" });

  event.respondWith(
    (async () => {
      const cache = await caches.open(TILE_CACHE);
      const cached = await cache.match(cacheRequest);

      if (cached && cacheIsFresh(cached)) {
        return cached;
      }

      try {
        const response = await fetch(cacheRequest);
        if (response.ok) {
          await cachePut(cache, cacheRequest, response);
        }
        return response;
      } catch {
        if (cached) return cached;
        return new Response("", { status: 503, statusText: "Tile fetch failed" });
      }
    })()
  );
});
