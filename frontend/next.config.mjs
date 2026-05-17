/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
    /**
     * critters: critical CSS 를 HTML 에 인라인, 나머지 CSS 는 media=print onload 로 비동기화
     * → 동일 출처 CSS 청크(73441959… 0.9KiB 등) 렌더링 차단 완화.
     */
    optimizeCss: true,
    /** 트리쉐이킹 최적화: 큰 순수 패키지의 import 깊이 감소 — 번들 parse/전송 시간 절감 */
    optimizePackageImports: ["es-hangul", "lottie-react", "@supabase/supabase-js"],
    /**
     * [Web Vitals] CLS/LCP/INP attribution 활성화.
     * - useReportWebVitals 콜백의 `attribution` 필드에 LargestShiftSource/LargestShiftTarget(CLS),
     *   EventEntry/EventTarget(INP), Element(LCP)이 들어와 어느 DOM이 문제였는지 추적 가능.
     * - 런타임 동작 영향 없음(콜백에 부가 데이터만 더 실어 보냄).
     */
    webVitalsAttribution: ["CLS", "LCP", "INP"]
  },

  compiler: {
    /** production 불필요 console.* 제거(에러 로그 유지). Next SWC 레벨에서 적용되어 런타임 비용 최소화 */
    removeConsole: { exclude: ["error", "warn"] }
  },

  images: {
    formats: ["image/avif", "image/webp"]
  },

  /** apex → www: middleware.ts에서 HTTP 308 */
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/Img/Icon/trash_bag_24.svg" }];
  },

  /**
   * Permissions-Policy: unload=*
   * - 우리 코드에는 unload/beforeunload 핸들러가 없으나, 서드파티 SDK(gtag, clarity)가
   *   내부적으로 unload 리스너를 등록하려 시도하면서 Chrome 이 "Permissions policy violation: unload
   *   is not allowed in this document" 위반 로그를 콘솔에 남깁니다(기능 영향 없음, 노이즈).
   * - unload=* 로 모든 컨텍스트에서 허용해 위반 로그를 제거합니다. 우리 코드는 unload 미사용이므로
   *   보안적·기능적 차이 없음. 서드파티의 unload 마이그레이션이 끝나면 이 헤더는 제거해도 됩니다.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Permissions-Policy", value: "unload=*" },
          {
            key: "Link",
            value:
              "<https://mts.daumcdn.net>; rel=preconnect, <https://dapi.kakao.com>; rel=preconnect"
          }
        ]
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }]
      },
      {
        source: "/fonts/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
        ]
      },
      {
        source: "/Img/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=2592000, stale-while-revalidate=86400"
          }
        ]
      }
    ];
  },

  webpack: (config, { dev }) => {
    if (dev && process.env.NEXT_DEV_POLL === "1") {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/.next/**",
          "**/data/stores.json",
          "**/terminals/**"
        ]
      };
    }
    return config;
  }
};

export default nextConfig;
