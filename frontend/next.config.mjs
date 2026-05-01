/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
    /** 트리쉐이킹 최적화: 큰 순수 패키지의 import 깊이 감소 — 번들 parse/전송 시간 절감 */
    optimizePackageImports: ["es-hangul", "lottie-react"]
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
