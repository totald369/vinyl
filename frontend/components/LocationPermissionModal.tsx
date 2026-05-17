"use client";

type Props = {
  open: boolean;
  /** 브라우저에서 사이트 위치가 차단됨 — 앱 버튼만으로는 프롬프트 불가 */
  blocked?: boolean;
  onClose: () => void;
  onAllow: () => void;
};

export default function LocationPermissionModal({ open, blocked = false, onClose, onAllow }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="mx-6 flex w-full max-w-[320px] flex-col gap-5 rounded-[16px] bg-white px-6 py-7 shadow-[0px_8px_24px_0px_rgba(0,0,0,0.16)]">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-[#f5fae1]">
            <img src="/Img/Icon/my_location_44.svg" alt="" width={32} height={32} className="size-8" />
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-[18px] font-bold leading-[1.4] text-[#171717]">
              {blocked ? "브라우저에서 위치가 차단됨" : "위치 권한이 필요합니다"}
            </h2>
            {blocked ? (
              <div className="text-left text-[14px] font-normal leading-[1.55] text-[#666666]">
                <p className="mb-2">
                  크롬이 이 사이트의 위치 접근을 막아 두었습니다. 아래처럼 허용한 뒤{" "}
                  <strong className="font-semibold text-[#171717]">다시 시도</strong>를 눌러주세요.
                </p>
                <ol className="list-decimal space-y-1.5 pl-4">
                  <li>주소창 왼쪽 자물쇠(또는 ⓘ) 탭</li>
                  <li>권한 → 위치 → 허용</li>
                  <li>이 화면으로 돌아와 다시 시도</li>
                </ol>
                <p className="mt-2 text-[13px] text-[#999999]">
                  이전에 저장된 위치가 있으면 지도는 그곳으로 먼저 이동합니다.
                </p>
              </div>
            ) : (
              <p className="text-[14px] font-normal leading-[1.5] text-[#666666]">
                내 주변 판매처를 찾으려면
                <br />
                위치 접근을 허용해주세요.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onAllow}
            className="h-12 w-full rounded-[8px] bg-[#171717] text-[16px] font-bold leading-[1.5] text-[#d4fe1c]"
          >
            {blocked ? "다시 시도" : "위치 허용하기"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-12 w-full rounded-[8px] bg-[#f5f5f5] text-[16px] font-bold leading-[1.5] text-[#999999]"
          >
            나중에
          </button>
        </div>
      </div>
    </div>
  );
}
