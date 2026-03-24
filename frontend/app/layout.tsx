import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "종량제봉투 판매처 지도 | 우리동네 쓰레기봉투 찾기",
  description:
    "내 주변 종량제봉투, 불연성마대, 폐기물 스티커 판매처를 지도에서 빠르게 찾으세요.",
  keywords: ["종량제봉투", "불연성마대", "폐기물 스티커", "판매처", "쓰레기봉투"],
  icons: {
    icon: "/Img/Icon/trash_bag_24.svg",
    apple: "/Img/Icon/trash_bag_24.svg"
  },
  openGraph: {
    title: "종량제봉투 판매처 지도",
    description: "내 주변 쓰레기봉투 판매처 찾기",
    url: "https://vinyl-ochre.vercel.app",
    siteName: "쓰레기봉투 지도",
    locale: "ko_KR",
    type: "website"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
export const metadata = {
  verification: {
    google: "sLuNDaRp2dzRT9qid7DV_IDcnXHANrcuz1ULL", // content 값만 넣기
  },
};