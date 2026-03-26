import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/edit-request" },
  title: "판매처 정보 수정 요청",
  description:
    "등록된 판매처의 폐업·주소 변경·판매 품목 변경 등을 요청하세요. 확인 후 지도 정보가 업데이트됩니다.",
  openGraph: {
    title: "판매처 정보 수정 요청",
    description: "잘못된 판매처 정보를 알려주시면 검토 후 반영합니다.",
    url: "/edit-request"
  },
  robots: { index: true, follow: true }
};

export default function EditRequestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
