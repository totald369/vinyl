import type { Metadata } from "next";
import HomeClient from "./HomeClient";

const HOME_TITLE =
  "종량제봉투·불연성마대·PP마대·건설마대 판매처 찾기 | 위치 기반 지도";
const HOME_DESCRIPTION =
  "종량제봉투, 불연성마대, PP마대(건설마대), 폐기물 스티커 판매처를 내 위치·주소·업체명으로 검색하고 지도에서 거리순으로 확인하세요.";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: "/",
  },
  twitter: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
};

export default function HomePage() {
  return (
    <>
      <p className="sr-only">
        trashbagmap에서 종량제봉투, 불연성마대, PP마대, 건설마대, 폐기물 스티커 판매처를 위치·주소·업체명으로
        검색할 수 있습니다.
      </p>
      <HomeClient />
    </>
  );
}
