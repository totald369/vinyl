import type { ResolvedRegionLeaf } from "@/lib/koreaRegions";

/** 지역별 판매처 데이터는 상단 목록·지도에 두고, 하단에서는 검색 노출용 문장만 제공합니다. */
export default function RegionSeoFooter(props: {
  leaf: ResolvedRegionLeaf;
}) {
  const { leaf } = props;
  const place = leaf.headingLabelKo;
  return (
    <footer className="border-t border-neutral-100 bg-[#fafafa] px-4 pb-10 pt-8">
      <div className="mx-auto max-w-md">
        <h2 className="text-[14px] font-bold leading-snug tracking-[0.1px] text-[#171717]">
          {place} 종량제 봉투 · 불연성마대 안내
        </h2>
        <div className="mt-3 space-y-3 text-[14px] font-normal leading-[1.6] tracking-[0.05px] text-[#454545]">
          <p>
            {place}에서 종량제 봉투가 필요하면 등록 매장 목록과 지도를 함께 사용하면 판매처 위치와 이동
            순서를 정하기 편합니다. 마커를 누르면 주소 확인이 빨라져 헛방을 줄일 수 있습니다.
          </p>
          <p>
            생활 쓰레기 종량제 외에도 불연성마대나 폐기물 스티커는 반드시 해당 품목을 취급하는
            매장으로 가야 하는 경우가 많습니다. 화면 상단 카테고리에서 필터를 바꾸면 같은 {place}{" "}
            기준으로 품목별 판매처만 다시 모아 볼 수 있습니다.
          </p>
          <p>
            공사·입주 등으로 매장별 재고·단가 변동은 있으니 방문 또는 전화로 최종 확인을 권장합니다.
          </p>
          <p>
            다른 시·구를 확인하려면 전국 목록 메뉴에서 지역을 바꿔 접속해 주세요. 판매처 데이터는 계속
            보완되는 공개 목록입니다.
          </p>
          <p>
            종량제 봉투부터 불연성마대·폐기물 스티커까지 한 지역 안에서 순서만 바꿔 찾아보면 이동
            동선 설계와 폐기 일정 준비에 시간을 덜 들일 수 있습니다.
          </p>
        </div>
      </div>
    </footer>
  );
}
