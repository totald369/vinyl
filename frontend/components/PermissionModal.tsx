"use client";

import Modal from "@/components/ui/Modal";

type Props = {
  open: boolean;
  onAllow: () => void;
  onManualSearch: () => void;
};

export default function PermissionModal({ open, onAllow, onManualSearch }: Props) {
  return (
    <Modal
      open={open}
      title="내 위치를 허용하시겠습니까?"
      description="내 위치를 켜면 내 주변 종량제 판매처를 찾을 수 있습니다."
      actions={
        <>
          <button
            type="button"
            onClick={onManualSearch}
            className="w-1/2 rounded-xl border border-border-strong bg-bg-surface px-3 py-3 text-body-sm text-text-secondary"
          >
            수동 검색
          </button>
          <button
            type="button"
            onClick={onAllow}
            className="w-1/2 rounded-xl bg-brand-500 px-3 py-3 text-body-sm text-text-inverse"
          >
            허용
          </button>
        </>
      }
    />
  );
}
