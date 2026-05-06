import "./globals.css";
import localFont from "next/font/local";
import type { Metadata } from "next";

const pretendard = localFont({
  src: "../public/fonts/Pretendard-Regular.subset.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-pretendard",
  preload: true
});
import ChunkLoadRecovery from "@/components/ChunkLoadRecovery";
import GlobalSeoNav from "@/components/GlobalSeoNav";
import { GoogleAnalyticsScripts } from "@/components/GoogleAnalyticsScripts";
import { GtagRouteTracker } from "@/components/GtagRouteTracker";
import { MicrosoftClarityScripts } from "@/components/MicrosoftClarityScripts";
import { CLARITY_PROJECT_ID } from "@/lib/clarity";
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
      "naver-site-verification": "824366dca81a5ce431470ba2a55f371672af2006",
    },
  },

  icons: {
    icon: "/Img/Icon/trash_bag_24.svg",
    apple: "/Img/Icon/trash_bag_24.svg",
  },

  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: "/",
    siteName: SITE_BRAND_KO,
    locale: "ko_KR",
    type: "website",
    images: [{ ...defaultOpenGraphImage, alt: DEFAULT_OG_IMAGE_ALT }],
  },

  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [defaultOpenGraphImage.url],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isProd = process.env.NODE_ENV === "production";

  return (
    <html lang="ko" className={pretendard.variable}>
      <head>
        <link rel="preconnect" href="https://dapi.kakao.com" />
        <link rel="dns-prefetch" href="https://dapi.kakao.com" />
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1201776814995453"
          crossOrigin="anonymous"
        />
        {/*
         * [LCP 최적화] GA·Clarity를 lazyOnload로 변경 → 메인 스레드 경합 최소화
         */}
        {isProd && GA_MEASUREMENT_ID ? <GoogleAnalyticsScripts /> : null}
        {isProd && CLARITY_PROJECT_ID ? <MicrosoftClarityScripts /> : null}
      </head>
      <body className={pretendard.className}>
        <ChunkLoadRecovery />
        {isProd && GA_MEASUREMENT_ID && GA_ROUTE_TRACKER_ENABLED ? <GtagRouteTracker /> : null}
        {children}
        <GlobalSeoNav />
      </body>
    </html>
  );
}
