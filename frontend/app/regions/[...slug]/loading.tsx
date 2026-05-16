import RegionStoreListSkeleton from "@/components/regions/RegionStoreListSkeleton";

/**
 * picker 에서 지역 탭 직후 Next.js 가 즉시 보여주는 transition UI.
 * 빈 캔버스 대신 풀스크린 리스트 골격 + 스켈레톤 → “진행 중” 체감.
 */
export default function RegionsLeafLoading() {
  return <RegionStoreListSkeleton />;
}
