/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true
  },
  /**
   * data/stores.json 등 대용량 파일이 웹팩 감시 대상에 들어가면 macOS에서
   * EMFILE(too many open files)가 나고, 라우트/청크 컴파일이 깨져
   * `/_next/static/chunks/main-app.js` 등이 404로 떨어질 수 있습니다.
   */
  webpack: (config, { dev }) => {
    if (dev) {
      // Next 기본값은 RegExp라 배열로 섞으면 webpack 스키마 검증이 깨짐 → 문자열 glob만 사용
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/.next/**",
          "**/data/stores.json"
        ]
      };
      if (process.env.NEXT_DEV_POLL === "1") {
        config.watchOptions.poll = 1000;
        config.watchOptions.aggregateTimeout = 300;
      }
    }
    return config;
  }
};

export default nextConfig;
