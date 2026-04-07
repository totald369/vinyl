/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true
  },
  /** non-www → www (lib/site.ts SITE_URL·GA 스트림과 동일 호스트로 통일) */
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "trashbagmap.com" }],
        destination: "https://www.trashbagmap.com/:path*",
        permanent: true
      }
    ];
  },
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/Img/Icon/trash_bag_24.svg" }];
  },
  /** EMFILE 등으로 감시가 불안정할 때만: NEXT_DEV_POLL=1 npm run dev */
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
