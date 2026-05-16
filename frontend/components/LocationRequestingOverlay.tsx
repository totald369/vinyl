"use client";

type Props = {
  visible: boolean;
  /** 홈: bottom sheet(z-sheet=20) 위, 모달(60) 아래. 지역 전체화면 리스트:z-[60] 위면 61+ */
  zClassName?: string;
};

/**
 * Geolocation getCurrentPosition 대기 중 사용자에게 피드백 (모바일에서 멈춘 것처럼 보이는 현상 완화).
 * pointer-events-none — 지도/스크롤 제스처는 그대로 통과.
 */
export default function LocationRequestingOverlay({
  visible,
  zClassName = "z-[45]"
}: Props) {
  if (!visible) return null;

  return (
    <div
      className={`pointer-events-none fixed inset-0 ${zClassName} flex items-center justify-center p-6`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="위치 확인 중"
    >
      <div className="flex max-w-[280px] items-center gap-3 rounded-[14px] border border-[#eee] bg-white/95 px-4 py-3 shadow-[0px_4px_20px_rgba(0,0,0,0.12)] backdrop-blur-[6px]">
        <div
          className="size-5 shrink-0 animate-spin rounded-full border-2 border-neutral-200 border-t-[#171717]"
          aria-hidden
        />
        <p className="text-left text-[14px] font-semibold leading-snug tracking-[0.1px] text-[#171717]">
          위치를 확인하는 중입니다…
        </p>
      </div>
    </div>
  );
}
