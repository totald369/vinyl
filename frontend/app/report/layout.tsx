import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/report" },
  title: "판매처 제보",
  description:
    "새 종량제봉투·불연성마대·폐기물 스티커 판매처를 제보하세요. 위치와 품목을 등록하면 검토 후 지도에 반영됩니다.",
  openGraph: {
    title: "판매처 제보",
    description: "미등록 판매처를 지도에 올릴 수 있도록 제보해 주세요.",
    url: "/report"
  },
  robots: { index: true, follow: true }
};

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
