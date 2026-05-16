/**
 * /regions/[...slug] 라우트 transition 중 즉시 표시되는 loading UI.
 *
 * 변경 전: picker 에서 region 카드를 클릭하면 RSC payload + JS chunk 다운로드 +
 *          SSR(ISR cache miss 시 수백 ms) + Vercel cold 누적으로 ~수백 ms 빈 화면 →
 *          사용자가 "화면이 멈춘 것 같다" 고 느낌.
 * 변경 후: Next.js App Router 의 표준 loading.tsx 로 라우트 transition 시점에
 *          즉시 표시 → 클릭이 즉시 반응한 것처럼 보이고 실제 페이지 mount 까지 자연스러운 교체.
 *
 * UI: page.tsx 의 Suspense fallback 과 동일한 빈 캔버스 (시각적 일관성 유지).
 */
export default function RegionsLeafLoading() {
  return (
    <main
      className="mx-auto min-h-[100dvh] max-w-md bg-bg-canvas"
      aria-busy="true"
      aria-label="지역 판매처 불러오는 중"
    />
  );
}
