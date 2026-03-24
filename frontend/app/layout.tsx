import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Map Store Service",
  description: "지도 기반 판매처 검색 서비스"
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
