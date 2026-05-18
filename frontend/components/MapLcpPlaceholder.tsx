/**
 * 지도 영역 LCP 후보 — fetchPriority=high 로 PSI "우선순위 힌트" 충족.
 * 실제 지도 타일은 MapView(z-index 1)가 덮음.
 */
export default function MapLcpPlaceholder() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/static/map-placeholder.webp"
      alt=""
      width={800}
      height={600}
      fetchPriority="high"
      loading="eager"
      decoding="async"
      className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
      aria-hidden
    />
  );
}
