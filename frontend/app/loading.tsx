/**
 * 루트 세그먼트 RSC 스트리밍 대기 중 즉시 표시 (모바일 첫 방문 TTFB 동안 빈 화면 완화).
 * 레이아웃·토큰은 globals + layout 과 동일한 배경만 사용 (UI 추가 없이 최소 칩).
 */
export default function RootLoading() {
  return (
    <main
      className="relative mx-auto flex h-[100dvh] max-w-md flex-col items-center justify-center overflow-hidden bg-bg-canvas px-6"
      aria-busy="true"
      aria-label="페이지 로딩 중"
    >
      <div
        className="size-9 shrink-0 animate-spin rounded-full border-2 border-neutral-200 border-t-[#171717]"
        aria-hidden
      />
      <p className="mt-4 text-center text-[14px] font-medium tracking-[0.1px] text-[#666666]">
        불러오는 중입니다…
      </p>
    </main>
  );
}
