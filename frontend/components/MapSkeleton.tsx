/**
 * 카카오 지도 SDK 로드 전에도 뷰포트와 동일한 높이를 유지해 CLS를 줄입니다.
 */
export default function MapSkeleton() {
  return (
    <div
      className="absolute inset-0 flex h-full w-full flex-col items-center justify-center bg-[#e8ebef]"
      aria-busy="true"
      aria-label="지도 로딩 중"
    >
      <div
        className="h-[120px] w-[120px] animate-pulse rounded-[20px] bg-[#d1d6de]"
        aria-hidden
      />
      <p className="mt-4 text-body-sm text-text-secondary">카카오 지도를 불러오는 중입니다...</p>
    </div>
  );
}
