"use client";

import { useEffect, useRef } from "react";
import { StoreData, StoreListFilter } from "@/hooks/useStores";
import type { KakaoCustomOverlay, KakaoMap, KakaoMapPoint, KakaoMarker } from "@/lib/kakao";
import { LatLng } from "@/lib/types";

type Props = {
  center: LatLng;
  centerVersion?: number;
  /** 탐색 모드 등에서 지도 확대 단계(1~14, 숫자가 클수록 더 넓게). center 이동 시 한 번 적용 */
  preferredMapLevel?: number | null;
  stores: StoreData[];
  activeFilter: StoreListFilter;
  selectedStoreId?: string | null;
  onSelectStore: (store: StoreData) => void;
  userMarkerPosition?: LatLng | null;
};

const USER_MARKER_SRC = "/Img/Icon/User_marker.svg";
const USER_MARKER_SIZE = 64;

/** 지도에 그리는 아이콘(px). SVG 에셋과 동일하게 유지 */
const STORE_MARKER_DISPLAY_PX = 80;
/**
 * 지도 클릭/탭을 MapProjection으로 픽셀화한 뒤, 이 거리(px) 안의 마커만 후보로 두고
 * 가장 가까운 매장을 선택. 80×80 아이콘 모서리(≈56.6px) + 소폭 여유.
 */
const STORE_PICK_MAX_DISTANCE_PX = 58;

function mapPointToXY(pt: KakaoMapPoint | { x: number; y: number }): { x: number; y: number } {
  if ("getX" in pt && typeof pt.getX === "function" && typeof pt.getY === "function") {
    return { x: pt.getX(), y: pt.getY() };
  }
  const p = pt as { x: number; y: number };
  return { x: p.x, y: p.y };
}

const FILTER_MARKER_MAP: Record<StoreListFilter, { src: string; selectedSrc: string }> = {
  payBag: {
    src: "/Img/Icon/trash_bag_80.svg",
    selectedSrc: "/Img/Icon/trash_bag_80_selected.svg"
  },
  nonBurnable: {
    src: "/Img/Icon/non-fire_80.svg",
    selectedSrc: "/Img/Icon/non-fire_80_selected.svg"
  },
  largeSticker: {
    src: "/Img/Icon/sticker_80.svg",
    selectedSrc: "/Img/Icon/sticker_80_selected.svg"
  }
};

function createStoreMarkerElements(
  store: StoreData,
  filter: StoreListFilter,
  isSelected: boolean
): { root: HTMLDivElement; img: HTMLImageElement } {
  const meta = FILTER_MARKER_MAP[filter];
  const root = document.createElement("div");
  root.style.width = `${STORE_MARKER_DISPLAY_PX}px`;
  root.style.height = `${STORE_MARKER_DISPLAY_PX}px`;
  root.style.position = "relative";
  root.style.display = "flex";
  root.style.alignItems = "center";
  root.style.justifyContent = "center";
  root.style.pointerEvents = "none";
  root.style.userSelect = "none";

  const img = document.createElement("img");
  img.src = isSelected ? meta.selectedSrc : meta.src;
  img.alt = "";
  img.width = STORE_MARKER_DISPLAY_PX;
  img.height = STORE_MARKER_DISPLAY_PX;
  img.draggable = false;
  img.style.pointerEvents = "none";
  img.style.userSelect = "none";

  root.appendChild(img);
  return { root, img };
}

export default function MapView({
  center,
  centerVersion = 0,
  preferredMapLevel = null,
  stores,
  activeFilter,
  selectedStoreId,
  onSelectStore,
  userMarkerPosition = null
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const storeOverlayMapRef = useRef<
    Map<string, { overlay: KakaoCustomOverlay; img: HTMLImageElement }>
  >(new Map());
  const userMarkerRef = useRef<KakaoMarker | null>(null);
  const prevCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevCenterVersionRef = useRef(0);
  const prevSelectedIdRef = useRef<string | null>(null);
  const activeFilterRef = useRef<StoreListFilter>(activeFilter);
  activeFilterRef.current = activeFilter;

  const onSelectStoreRef = useRef(onSelectStore);
  onSelectStoreRef.current = onSelectStore;

  const storesPickRef = useRef<StoreData[]>(stores);
  storesPickRef.current = stores;

  const pickListenerAttachedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || typeof window === "undefined" || !window.kakao?.maps) return;

    const kakao = window.kakao.maps;

    if (!mapRef.current) {
      mapRef.current = new kakao.Map(containerRef.current, {
        center: new kakao.LatLng(Number(center.lat), Number(center.lng)),
        level: 5
      });
      prevCenterRef.current = { lat: Number(center.lat), lng: Number(center.lng) };
    }

    if (pickListenerAttachedRef.current) return;
    pickListenerAttachedRef.current = true;

    const map = mapRef.current;
    const onMapClick = (...args: unknown[]) => {
      const mouseEvent = args[0] as { latLng: { getLat: () => number; getLng: () => number } };
      if (!mouseEvent?.latLng) return;

      const list = storesPickRef.current;
      if (!list.length) return;

      const proj = map.getProjection();
      if (!proj?.pointFromCoords) return;

      const clickXY = mapPointToXY(proj.pointFromCoords(mouseEvent.latLng));

      let best: StoreData | null = null;
      let bestDist = Infinity;

      for (const store of list) {
        const lat = Number(store.lat);
        const lng = Number(store.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const mXY = mapPointToXY(proj.pointFromCoords(new kakao.LatLng(lat, lng)));
        const d = Math.hypot(mXY.x - clickXY.x, mXY.y - clickXY.y);
        if (d <= STORE_PICK_MAX_DISTANCE_PX && d < bestDist) {
          bestDist = d;
          best = store;
        }
      }

      if (best) {
        console.debug("[MapView] nearest marker pick:", best.id, bestDist.toFixed(1), "px");
        onSelectStoreRef.current(best);
      }
    };

    kakao.event.addListener(map, "click", onMapClick);

    return () => {
      kakao.event.removeListener(map, "click", onMapClick);
      pickListenerAttachedRef.current = false;
    };
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    const lat = Number(center.lat);
    const lng = Number(center.lng);
    if (
      centerVersion === prevCenterVersionRef.current &&
      prevCenterRef.current &&
      prevCenterRef.current.lat === lat &&
      prevCenterRef.current.lng === lng
    ) {
      return;
    }
    prevCenterRef.current = { lat, lng };
    prevCenterVersionRef.current = centerVersion;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(lat, lng));
    if (preferredMapLevel != null && Number.isFinite(preferredMapLevel)) {
      mapRef.current.setLevel(Math.max(1, Math.min(14, Math.round(preferredMapLevel))));
    }
  }, [center.lat, center.lng, centerVersion, preferredMapLevel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;

    storeOverlayMapRef.current.forEach(({ overlay }) => overlay.setMap(null));
    storeOverlayMapRef.current.clear();
    prevSelectedIdRef.current = null;

    const kakao = window.kakao.maps;

    stores.forEach((store) => {
      const lat = Number(store.lat);
      const lng = Number(store.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const isSelected = selectedStoreId != null && store.id === selectedStoreId;
      const { root, img } = createStoreMarkerElements(store, activeFilter, isSelected);

      const overlay = new kakao.CustomOverlay({
        map,
        position: new kakao.LatLng(lat, lng),
        content: root,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: isSelected ? 100 : 1,
        clickable: false
      });
      storeOverlayMapRef.current.set(store.id, { overlay, img });

      if (isSelected) {
        prevSelectedIdRef.current = store.id;
      }
    });
    // selectedStoreId is intentionally excluded — selection visual is handled separately below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, stores]);

  useEffect(() => {
    if (!window.kakao?.maps) return;

    const prevId = prevSelectedIdRef.current;
    const newId = selectedStoreId ?? null;

    if (prevId === newId) return;

    console.debug("[MapView] selection changed:", prevId, "→", newId, "(NO map movement)");

    const meta = FILTER_MARKER_MAP[activeFilterRef.current];

    if (prevId) {
      const prevEntry = storeOverlayMapRef.current.get(prevId);
      if (prevEntry) {
        prevEntry.img.src = meta.src;
        prevEntry.overlay.setZIndex(1);
      }
    }

    if (newId) {
      const newEntry = storeOverlayMapRef.current.get(newId);
      if (newEntry) {
        newEntry.img.src = meta.selectedSrc;
        newEntry.overlay.setZIndex(100);
      }
    }

    prevSelectedIdRef.current = newId;
  }, [selectedStoreId]);

  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;

    const map = mapRef.current;
    const kakao = window.kakao.maps;

    if (!userMarkerPosition) {
      if (userMarkerRef.current) {
        userMarkerRef.current.setMap(null);
        userMarkerRef.current = null;
      }
      return;
    }

    const lat = Number(userMarkerPosition.lat);
    const lng = Number(userMarkerPosition.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const position = new kakao.LatLng(lat, lng);
    const size = new kakao.Size(USER_MARKER_SIZE, USER_MARKER_SIZE);
    const offset = new kakao.Point(USER_MARKER_SIZE / 2, USER_MARKER_SIZE / 2);
    const image = new kakao.MarkerImage(USER_MARKER_SRC, size, { offset });

    if (!userMarkerRef.current) {
      userMarkerRef.current = new kakao.Marker({
        map,
        position,
        image,
        zIndex: 200
      });
    } else {
      userMarkerRef.current.setPosition(position);
      if (typeof userMarkerRef.current.setZIndex === "function") {
        userMarkerRef.current.setZIndex(200);
      }
    }
  }, [userMarkerPosition]);

  return <div ref={containerRef} className="h-full min-h-0 w-full" />;
}
