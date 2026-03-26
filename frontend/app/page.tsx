import type { Metadata } from "next";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  title: {
    absolute: "우리동네 종량제봉투 판매처 찾기 | 위치 기반 지도"
  },
  description:
    "내 주변 종량제봉투·불연성마대·폐기물 스티커 판매처를 지도에서 검색하고 거리순으로 확인하세요. 지도·목록·강남 안내로 빠르게 연결됩니다.",
  openGraph: {
    title: "우리동네 종량제봉투 판매처 찾기",
    description: "내 주변 쓰레기봉투·스티커 판매처를 지도에서 빠르게 확인하세요.",
    url: "/"
  },
  twitter: {
    title: "우리동네 종량제봉투 판매처 찾기",
    description: "내 주변 쓰레기봉투·스티커 판매처를 지도에서 빠르게 확인하세요."
  }
};

export default function HomePage() {
  return <HomeClient />;
}
