"use client";

/**
 * 홈 상단 검색 시트 vs 상세 시트 UI 상태를 한곳에 모음.
 *
 * 변경 전: HomeClient 상단에 useState 6개가 흩어져 가독성·리팩터 비용 증가.
 * 변경 후: 시트·검색·위치 모달 상태를 훅으로 캡슐화 — 부모는 핸들러 조합에 집중.
 * 측정: 코드 탐색 시간(정성); 동작 변경 없음.
 */
import { useState } from "react";
import type { BottomSheetSnap } from "@/lib/bottomSheetSnap";

export function useSheetController() {
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [bottomSheetSnap, setBottomSheetSnap] = useState<BottomSheetSnap>("collapsed");
  const [sheetBlocksMapPointer, setSheetBlocksMapPointer] = useState(false);
  const [sheetView, setSheetView] = useState<"list" | "detail">("list");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return {
    locationModalOpen,
    setLocationModalOpen,
    bottomSheetSnap,
    setBottomSheetSnap,
    sheetBlocksMapPointer,
    setSheetBlocksMapPointer,
    sheetView,
    setSheetView,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery
  };
}
