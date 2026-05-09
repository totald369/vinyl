import "./globals.css";
import localFont from "next/font/local";
import type { Metadata } from "next";
import Script from "next/script";

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
  const kakaoAppKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? "";
  const kakaoSdkUrl = kakaoAppKey
    ? `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(kakaoAppKey)}&autoload=false`
    : null;

  return (
    <html lang="ko" className={pretendard.variable}>
      <head>
        <link rel="preconnect" href="https://dapi.kakao.com" />
        <link rel="dns-prefetch" href="https://dapi.kakao.com" />
        {/**
         * [LCP] Kakao SDK 스크립트는 클라이언트 훅(`useKakaoMapLoader`)에서 동적으로 주입되므로
         * preload로 다운로드만 미리 띄워 hydration → SDK fetch 의 직렬 대기를 단축.
         */}
        {kakaoSdkUrl ? (
          <link rel="preload" as="script" href={kakaoSdkUrl} />
        ) : null}
        {/**
         * [LCP] AdSense는 비핵심 → next/script lazyOnload 로 옮겨 초기 네트워크/메인 스레드 경합 제거.
         * 변경 전: head 안에서 즉시 async 로드 → Kakao SDK fetch 와 네트워크/CPU 경합.
         * 변경 후: 첫 페인트·hydration 이후 idle 타이밍에 로드.
         */}
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
        {isProd ? (
          <Script
            id="adsbygoogle-loader"
            src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1201776814995453"
            strategy="lazyOnload"
            crossOrigin="anonymous"
          />
        ) : null}
      </body>
    </html>
  );
}
