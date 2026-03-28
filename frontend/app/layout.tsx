import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { GA_MEASUREMENT_ID } from "@/lib/gtag";
import { SITE_URL } from "@/lib/site";

const DEFAULT_TITLE =
  "종량제봉투·불연성마대·PP마대·건설마대 판매처 찾기 | 위치 기반 지도";
const DEFAULT_DESCRIPTION =
  "종량제봉투, 불연성마대, PP마대(건설마대), 폐기물 스티커 판매처를 내 위치·주소·업체명으로 검색하고 지도에서 거리순으로 확인하세요. 전국 지정 판매처 안내.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: "%s | trashbagmap"
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [
    "종량제봉투",
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
  },

  icons: {
    icon: "/Img/Icon/trash_bag_24.svg",
    apple: "/Img/Icon/trash_bag_24.svg",
  },

  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: "/",
    siteName: "trashbagmap",
    locale: "ko_KR",
    type: "website",
  },

  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
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
                gtag('config', '${GA_MEASUREMENT_ID}');
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
