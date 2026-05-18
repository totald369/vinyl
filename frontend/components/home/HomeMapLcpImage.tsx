import Image from "next/image";

/**
 * 홈 LCP 후보 — Server Component 로 HTML 초기 문서에 포함.
 * fetchPriority=high(priority) + layout preload 로 리소스 발견·다운로드 지연 완화.
 * 타일 로드 후 HomeMapLcpDismiss 가 opacity 0 처리.
 */
export default function HomeMapLcpImage() {
  return (
    <div
      id="home-lcp-placeholder"
      className="pointer-events-none fixed inset-y-0 left-1/2 z-0 h-[100dvh] w-full max-w-md -translate-x-1/2 transition-opacity duration-300"
      aria-hidden
    >
      <Image
        src="/static/map-placeholder.webp"
        alt=""
        fill
        priority
        sizes="(max-width: 448px) 100vw, 448px"
        quality={75}
        className="object-cover"
      />
    </div>
  );
}
