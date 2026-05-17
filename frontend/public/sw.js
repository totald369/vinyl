/* eslint-disable no-restricted-globals */
/**
 * 카카오 CDN: /2x/ → 1x URL 변환 + 타일·정적 리소스 30일 캐시.
 */
const TILE_CACHE = "kakao-tiles-v2";
const TILE_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

const KAKAO_HOSTS = new Set(["t1.daumcdn.net", "mts.daumcdn.net"]);

function isKakaoCdn(url) {
  return KAKAO_HOSTS.has(url.hostname);
}

function has2xPath(url) {
  return url.pathname.includes("/2x/");
}

function to1xUrl(requestUrl) {
  const url = new URL(requestUrl);
  if (!isKakaoCdn(url) || !has2xPath(url)) {
    return requestUrl;
  }
  url.pathname = url.pathname.replace(/\/2x\//g, "/");
  return url.toString();
}

function isCacheableKakaoAsset(url) {
  if (url.hostname === "mts.daumcdn.net" && url.pathname.includes("/tile/")) {
    return true;
  }
  if (url.hostname === "t1.daumcdn.net") {
    return (
      url.pathname.includes("bg_tile") ||
      url.pathname.includes("transparent") ||
      url.pathname.includes("m_bi")
    );
  }
  return false;
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

async function fetchWithOptionalCache(event, requestUrl) {
  const normalized = to1xUrl(requestUrl);
  const url = new URL(normalized);
  const cacheRequest =
    normalized === requestUrl
      ? event.request
      : new Request(normalized, {
          method: "GET",
          mode: event.request.mode,
          credentials: event.request.credentials,
          cache: event.request.cache
        });

  if (!isCacheableKakaoAsset(url)) {
    try {
      return await fetch(cacheRequest);
    } catch {
      return new Response("", { status: 503, statusText: "Kakao asset fetch failed" });
    }
  }

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
    return new Response("", { status: 503, statusText: "Kakao tile fetch failed" });
  }
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
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (!isKakaoCdn(url)) return;

  if (has2xPath(url) || isCacheableKakaoAsset(url)) {
    event.respondWith(fetchWithOptionalCache(event, event.request.url));
  }
});
