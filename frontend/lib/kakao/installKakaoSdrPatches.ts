/**
 * 카카오 지도 HD(2x) 감지·요청 차단 — DPR 외 matchMedia·fetch/XHR·SW 보완.
 * 지도 SDK 로드 전에 한 번 설치 (KakaoMapSdkScript).
 */

let networkPatched = false;
let matchMediaPatched = false;
let originalMatchMedia: typeof window.matchMedia | null = null;

const HD_MEDIA_QUERY =
  /min-resolution|max-resolution|resolution|dppx|device-pixel-ratio|-webkit-device-pixel-ratio/i;

function rewriteKakao2xUrl(url: string): string {
  if (!url.includes("daumcdn.net") || !url.includes("/2x/")) {
    return url;
  }
  return url.replace(/\/2x\//g, "/");
}

/** fetch / XHR 의 `/2x/` 경로를 1x 로 변환 (img src 는 SW 가 처리) */
export function installKakaoSdrNetworkPatches(): void {
  if (typeof window === "undefined" || networkPatched) return;
  networkPatched = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === "string") {
      return originalFetch(rewriteKakao2xUrl(input), init);
    }
    if (input instanceof Request && input.url.includes("/2x/")) {
      return originalFetch(new Request(rewriteKakao2xUrl(input.url), input), init);
    }
    return originalFetch(input, init);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null
  ) {
    const nextUrl =
      typeof url === "string" ? rewriteKakao2xUrl(url) : url;
    return originalOpen.call(this, method, nextUrl, async, username, password);
  };
}

/** `matchMedia('(min-resolution: 2dppx)')` 등 HD 판별을 항상 false */
export function installKakaoSdrMatchMediaShim(): void {
  if (typeof window === "undefined" || matchMediaPatched) return;
  matchMediaPatched = true;
  originalMatchMedia = window.matchMedia.bind(window);

  window.matchMedia = (query: string): MediaQueryList => {
    if (HD_MEDIA_QUERY.test(query)) {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false
      } as MediaQueryList;
    }
    return originalMatchMedia!(query);
  };
}

export function installAllKakaoSdrPatches(): void {
  installKakaoSdrNetworkPatches();
  installKakaoSdrMatchMediaShim();
}
