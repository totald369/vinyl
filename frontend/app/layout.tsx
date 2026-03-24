import "./globals.css";
import type { Metadata } from "next";

const OG_IMAGE = "https://vinyl-ochre.vercel.app/og-image.png";

export const metadata: Metadata = {
  title: "우리동네 종량제봉투 판매처 찾기 | 위치 기반 지도",
  description:
    "내 주변 종량제봉투, 불연성마대, 폐기물 스티커 판매처를 지도에서 바로 확인하세요.",
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
    url: "https://vinyl-ochre.vercel.app",
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
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
