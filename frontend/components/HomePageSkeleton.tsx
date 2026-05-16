/** 홈 Suspense / 스트리밍 대기 시 즉시 표시 — 빈 화면 대신 검색·시트 골격 */
export default function HomePageSkeleton() {
  return (
    <main
      className="relative mx-auto h-[100dvh] max-w-md overflow-hidden bg-bg-canvas"
      aria-busy="true"
      aria-label="지도와 판매처 목록 불러오는 중"
    >
      <div className="absolute left-[15px] right-[15px] top-[calc(16px+env(safe-area-inset-top,0px))] z-10 flex gap-2">
        <div className="h-12 min-h-12 flex-1 animate-pulse rounded-[8px] bg-white shadow-[0px_0px_1px_rgba(0,0,0,0.08),0px_4px_6px_rgba(0,0,0,0.16)]" />
        <div className="h-12 w-[88px] shrink-0 animate-pulse rounded-[8px] bg-[#171717]" />
      </div>
      <div className="absolute inset-0 bg-[#e8ebef]" aria-hidden />
      <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white px-4 pb-[env(safe-area-inset-bottom,0px)] pt-4 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
        <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-neutral-200" aria-hidden />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="mb-3 h-[124px] animate-pulse rounded-xl bg-neutral-100" />
        ))}
      </div>
    </main>
  );
}
