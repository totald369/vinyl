"use client";

import { DEFAULT_REGION } from "@/lib/types";
import { useAppStore } from "@/stores/useAppStore";

export default function MapPlaceholder() {
  const { listMode, userLocation, filteredStores } = useAppStore();

  const center =
    listMode === "myLocation" && userLocation
      ? `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`
      : `${DEFAULT_REGION.lat.toFixed(4)}, ${DEFAULT_REGION.lng.toFixed(4)}`;

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">지도</h2>
        <span className="text-xs text-slate-500">중심 좌표: {center}</span>
      </div>
      <div className="flex h-72 items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-600">
        실제 지도 SDK 연동 위치 (현재 매장 {filteredStores.length}개 표시 예정)
      </div>
    </section>
  );
}
