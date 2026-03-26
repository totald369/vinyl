import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { GA_MEASUREMENT_ID, GA_MEASUREMENT_IDS } from "@/lib/gtag";
import { SITE_URL } from "@/lib/site";

const OG_IMAGE = `${SITE_URL}/og-image.png`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "우리동네 종량제봉투 판매처 찾기 | 위치 기반 지도",
    template: "%s | 종량제봉투 지도"
  },
  description:
    "내 주변 종량제봉투·불연성마대·폐기물 스티커 판매처를 지도에서 검색하고 바로 확인하세요.",
  keywords: ["종량제봉투", "불연성마대", "폐기물 스티커", "판매처", "쓰레기봉투"],

  verification: {
    google: "bzqaOAyJOVuUHnFTeNbX13oFIddTUa_6pLJvMWo1UWI",
  },

  icons: {
    icon: "/Img/Icon/trash_bag_24.svg",
    apple: "/Img/Icon/trash_bag_24.svg",
  },

  openGraph: {
    title: "우리동네 종량제봉투 판매처 찾기",
    description: "내 주변 쓰레기봉투 판매처를 지도에서 빠르게 확인하세요.",
    url: "/",
    siteName: "종량제봉투 지도",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "우리동네 종량제봉투 판매처 찾기 — 위치 기반 지도 서비스",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "우리동네 종량제봉투 판매처 찾기",
    description: "내 주변 쓰레기봉투 판매처를 지도에서 빠르게 확인하세요.",
    images: [OG_IMAGE],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isProd = process.env.NODE_ENV === "production";

  return (
    <html lang="ko">
      <body>
        {isProd ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                ${GA_MEASUREMENT_IDS.map((id) => `gtag('config', '${id}');`).join("\n                ")}
              `}
            </Script>
          </>
        ) : null}
        <GoogleAnalytics />
        {children}
      </body>
    </html>
  );
}
