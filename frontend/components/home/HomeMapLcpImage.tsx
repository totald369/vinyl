/**
 * 홈 LCP 후보 — Server Component, 네이티브 img 로 초기 HTML에 직접 URL 노출.
 * next/image(_next/image) 우회 → 발견·다운로드 지연·5878 청크 회피.
 * 타일 로드 후 HomeMapLcpDismiss 가 opacity 0 처리.
 */
export default function HomeMapLcpImage() {
  return (
    <div
      id="home-lcp-placeholder"
      className="pointer-events-none fixed inset-y-0 left-1/2 z-0 h-[100dvh] w-full max-w-md -translate-x-1/2 transition-opacity duration-300"
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/static/map-placeholder.webp"
        alt=""
        width={448}
        height={600}
        fetchPriority="high"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
