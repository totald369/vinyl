import "./globals.css";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { pretendard } from "@/app/pretendard";
import ChunkLoadRecovery from "@/components/ChunkLoadRecovery";
import ConditionalKakaoMapSdk from "@/components/ConditionalKakaoMapSdk";
import { DelayedAnalyticsScripts } from "@/components/DelayedAnalyticsScripts";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import { LazyAdSense } from "@/components/LazyAdSense";
import GlobalSeoNav from "@/components/GlobalSeoNav";
import { GtagRouteTracker } from "@/components/GtagRouteTracker";
import { CLARITY_PROJECT_ID } from "@/lib/clarity";

const WebVitalsReporter = dynamic(() => import("@/components/WebVitalsReporter"), {
  ssr: false
});
import { GA_MEASUREMENT_ID, GA_ROUTE_TRACKER_ENABLED } from "@/lib/gtag";
import { SITE_URL } from "@/lib/site";
import {
  DEFAULT_OG_IMAGE_ALT,
  SITE_BRAND_KO,
  SEO_META_DESCRIPTION_BY_VARIANT,
  SEO_META_TITLE_VARIANTS,
  defaultOpenGraphImage
} from "@/lib/seoBrand";
const DEFAULT_TITLE = SEO_META_TITLE_VARIANTS[0];
const DEFAULT_DESCRIPTION = SEO_META_DESCRIPTION_BY_VARIANT[0];

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_BRAND_KO,
  title: {
    default: DEFAULT_TITLE,
    template: `${SITE_BRAND_KO} | %s`
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    "쓰봉맵",
    "종량제봉투",
    "종량제 봉투",
    "불연성마대",
    "PP마대",
    "건설마대",
    "폐기물 스티커",
    "쓰레기봉투",
    "판매처",
    "위치 검색",
    "지도",
    "전주",
    "강남"
  ],

  verification: {
    google: "bzqaOAyJOVuUHnFTeNbX13oFIddTUa_6pLJvMWo1UWI",
    other: {
      "naver-site-verification": "824366dca81a5ce431470ba2a55f371672af2006"
    }
  },

  icons: {
    icon: "/Img/Icon/trash_bag_24.svg",
    apple: "/Img/Icon/trash_bag_24.svg"
  },

  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: "/",
    siteName: SITE_BRAND_KO,
    locale: "ko_KR",
    type: "website",
    images: [{ ...defaultOpenGraphImage, alt: DEFAULT_OG_IMAGE_ALT }]
  },

  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [defaultOpenGraphImage.url]
  }
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const isProd = process.env.NODE_ENV === "production";
  const kakaoAppKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? "";

  return (
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          href="/static/map-placeholder.webp"
          as="image"
          type="image/webp"
          fetchPriority="high"
        />
        <link rel="preconnect" href="https://mts.daumcdn.net" />
        <link rel="preconnect" href="https://dapi.kakao.com" />
        <link rel="dns-prefetch" href="https://t1.daumcdn.net" />
      </head>
      <body className={`${pretendard.className} font-sans antialiased`} suppressHydrationWarning>
        <ChunkLoadRecovery />
        <WebVitalsReporter />
        {isProd && GA_MEASUREMENT_ID && GA_ROUTE_TRACKER_ENABLED ? <GtagRouteTracker /> : null}
        <ConditionalKakaoMapSdk appKey={kakaoAppKey} />
        {isProd && (GA_MEASUREMENT_ID || CLARITY_PROJECT_ID) ? (
          <DelayedAnalyticsScripts />
        ) : null}
        {children}
        <GlobalSeoNav />
        {isProd ? <LazyAdSense client="ca-pub-1201776814995453" /> : null}
        {isProd ? <ServiceWorkerRegister /> : null}
      </body>
    </html>
  );
}
