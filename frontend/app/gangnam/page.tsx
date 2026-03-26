import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/gangnam" },
  title: "강남 종량제봉투 판매처 안내",
  description:
    "강남 종량제봉투 파는곳, 불연성마대 판매처, 폐기물 스티커 구매 정보를 정리했습니다. 지도 홈·판매처 목록과 연계해 내 주변 매장을 찾아보세요.",
  openGraph: {
    title: "강남 종량제봉투 판매처 안내",
    description: "강남권 종량제봉투·마대·스티커 판매 안내와 지도 연결 방법을 안내합니다.",
    url: "/gangnam"
  },
  twitter: {
    title: "강남 종량제봉투 판매처 안내",
    description: "강남권 종량제봉투·마대·스티커 판매 안내를 확인하세요."
  }
};

export default function GangnamPage() {
  return (
    <main>
      <nav aria-label="관련 페이지">
        <Link href="/">지도 홈</Link>
        {" · "}
        <Link href="/stores">판매처 목록</Link>
      </nav>
      <h1>강남 종량제봉투 판매처 안내</h1>
      <p>
        강남 지역에서 종량제봉투를 구매할 수 있는 판매처를 찾고 계신가요? 종량제봉투는 생활쓰레기를 버릴 때
        반드시 사용하는 정부 인증 봉투로, 지정된 판매점에서만 구입할 수 있습니다. 본 서비스의 지도에서는
        내 위치를 기준으로 주변 강남 종량제봉투 파는곳을 빠르게 찾아볼 수 있습니다.
      </p>
      <p>
        일부 구에서는 불연성 폐기물을 담기 위한 불연성마대 판매처도 함께 안내됩니다. 대형 폐기물을 배출할 때
        필요한 폐기물 스티커 구매가 가능한 곳도 지도에서 확인해 보세요.
      </p>
      <p>
        실제 매장 위치·영업 여부는 지자체 및 사업자 안내를 함께 확인하시기 바랍니다.
      </p>
    </main>
  );
}
