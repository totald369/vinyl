"use client";

type Props = {
  open: boolean;
  onClose: () => void;
  onAllow: () => void;
};

export default function LocationPermissionModal({ open, onClose, onAllow }: Props) {
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
              위치 권한이 필요합니다
            </h2>
            <p className="text-[14px] font-normal leading-[1.5] text-[#666666]">
              내 주변 판매처를 찾으려면<br />위치 접근을 허용해주세요.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onAllow}
            className="h-12 w-full rounded-[8px] bg-[#171717] text-[16px] font-bold leading-[1.5] text-[#d4fe1c]"
          >
            위치 허용하기
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
