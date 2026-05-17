"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { StoreData, StoreListFilter } from "@/hooks/useStores";
import type { KakaoCustomOverlay, KakaoMap, KakaoMapPoint, KakaoMarker } from "@/lib/kakao";
import {
  createKakaoMap,
  onKakaoMapTilesLoadedOnce,
  runKakaoMapsLoad
} from "@/lib/kakao/createKakaoMap";
import {
  ensureKakaoMapsReady,
  KAKAO_MAPS_READY_EVENT,
  startKakaoMapsWarmup
} from "@/lib/kakaoMapSdk";
import { perfTimeEnd, perfTimeStart } from "@/lib/perfMarks";
import { LatLng } from "@/lib/types";
import { getDistanceKm } from "@/lib/utils";

type Props = {
  center: LatLng;
  centerVersion?: number;
  preferredMapLevel?: number | null;
  stores: StoreData[];
  activeFilter: StoreListFilter;
  selectedStoreId?: string | null;
  onSelectStore: (store: StoreData) => void;
  userMarkerPosition?: LatLng | null;
};

const USER_MARKER_SRC = "/Img/Icon/User_marker.svg";
const USER_MARKER_SIZE = 64;

const STORE_MARKER_DISPLAY_PX = 80;
const STORE_PICK_MAX_DISTANCE_PX = 58;

/** Before first `idle`, avoid drawing every pin — closest N to map center only */
const PRIORITIZE_NEAR_CENTER = 96;
/** Hard cap on DOM overlays (CustomOverlay) per rebuild */
const MAX_MAP_MARKERS = 240;

type MapBoundsBox = { swLat: number; swLng: number; neLat: number; neLng: number };

function mapPointToXY(pt: KakaoMapPoint | { x: number; y: number }): { x: number; y: number } {
  if ("getX" in pt && typeof pt.getX === "function" && typeof pt.getY === "function") {
    return { x: pt.getX(), y: pt.getY() };
  }
  const p = pt as { x: number; y: number };
  return { x: p.x, y: p.y };
}

/**
 * [INP] 변경 전: selectedId 까지 의존성에 받아, selected 변경마다 전체 정렬 재실행 + 새 배열 반환.
 *   결과 useMemo 참조가 매번 새로 바뀌어 effect 가 240개 마커 diff 를 처음부터 다시 돌렸음.
 * 변경 후: 본 함수는 selected 와 무관하게 bounds·center·stores 만으로 결정.
 *   선택 마커의 강조(zIndex/img.src)는 별도 effect 에서 1~2개만 변경.
 *   selected store 가 pool 에 없는 경우(원거리 검색 결과)는 별도 effect 가 동적으로 추가.
 */
function pickStoresForMapMarkers(
  stores: StoreData[],
  mapCenter: LatLng,
  bounds: MapBoundsBox | null
): StoreData[] {
  const inPad = (lat: number, lng: number, b: MapBoundsBox) =>
    lat >= b.swLat && lat <= b.neLat && lng >= b.swLng && lng <= b.neLng;

  let pool =
    bounds == null
      ? stores
      : stores.filter((s) => inPad(Number(s.lat), Number(s.lng), bounds));

  if (bounds == null && pool.length > PRIORITIZE_NEAR_CENTER) {
    pool = [...stores]
      .map((s) => ({
        s,
        d: getDistanceKm(mapCenter.lat, mapCenter.lng, s.lat, s.lng)
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, PRIORITIZE_NEAR_CENTER)
      .map((x) => x.s);
  }

  if (pool.length > MAX_MAP_MARKERS) {
    pool = [...pool]
      .map((s) => ({
        s,
        d: getDistanceKm(mapCenter.lat, mapCenter.lng, s.lat, s.lng)
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_MAP_MARKERS)
      .map((x) => x.s);
  }

  return pool;
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
  _store: StoreData,
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

function MapViewInner({
  center,
  centerVersion = 0,
  preferredMapLevel = null,
  stores,
  activeFilter,
  selectedStoreId,
  onSelectStore,
  userMarkerPosition = null
}: Props) {
  const kakaoAppKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY ?? "";

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapSizeRef = useRef({ w: 360, h: 640 });
  const mapRef = useRef<KakaoMap | null>(null);
  const storeOverlayMapRef = useRef<
    Map<string, { overlay: KakaoCustomOverlay; img: HTMLImageElement }>
  >(new Map());
  const userMarkerRef = useRef<KakaoMarker | null>(null);
  const prevCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevCenterVersionRef = useRef(0);
  const activeFilterRef = useRef<StoreListFilter>(activeFilter);
  activeFilterRef.current = activeFilter;

  const onSelectStoreRef = useRef(onSelectStore);
  onSelectStoreRef.current = onSelectStore;

  const [mapBounds, setMapBounds] = useState<MapBoundsBox | null>(null);
  const idleBoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleHandlerRef = useRef<(() => void) | null>(null);
  const idleAttachedRef = useRef(false);

  const markerElPoolRef = useRef<{ root: HTMLDivElement; img: HTMLImageElement }[]>([]);
  const MAX_MARKER_POOL = MAX_MAP_MARKERS * 2;

  const centerLat = Number(center.lat);
  const centerLng = Number(center.lng);
  const mbSwLat = mapBounds?.swLat;
  const mbSwLng = mapBounds?.swLng;
  const mbNeLat = mapBounds?.neLat;
  const mbNeLng = mapBounds?.neLng;

  /**
   * [INP] visibleForMarkers 는 selectedStoreId 와 무관 — 선택 변경만으로 정렬·diff 가 재실행되지 않게.
   * 선택 store 가 pool 에 없는 경우는 아래 별도 useMemo 에서 합성한다.
   */
  const baseVisibleForMarkers = useMemo(() => {
    const boundsBox =
      mbSwLat != null && mbSwLng != null && mbNeLat != null && mbNeLng != null
        ? { swLat: mbSwLat, swLng: mbSwLng, neLat: mbNeLat, neLng: mbNeLng }
        : null;
    return pickStoresForMapMarkers(stores, { lat: centerLat, lng: centerLng }, boundsBox);
  }, [stores, centerLat, centerLng, mbSwLat, mbSwLng, mbNeLat, mbNeLng]);

  /**
   * selected 가 base pool 에 이미 있으면 base 그대로 (참조 동일) → diff effect 트리거 X.
   * 없을 때만 새 배열 생성. (원거리 검색 결과 등 보호 케이스)
   */
  const visibleForMarkers = useMemo(() => {
    if (!selectedStoreId) return baseVisibleForMarkers;
    const selected = stores.find((s) => s.id === selectedStoreId);
    if (!selected) return baseVisibleForMarkers;
    if (baseVisibleForMarkers.some((s) => s.id === selectedStoreId)) return baseVisibleForMarkers;
    const merged = [selected, ...baseVisibleForMarkers];
    return merged.length > MAX_MAP_MARKERS ? merged.slice(0, MAX_MAP_MARKERS) : merged;
  }, [baseVisibleForMarkers, selectedStoreId, stores]);

  const storesPickRef = useRef<StoreData[]>(visibleForMarkers);
  storesPickRef.current = visibleForMarkers;

  const acquireMarkerDom = (
    store: StoreData,
    filter: StoreListFilter,
    isSelected: boolean
  ): { root: HTMLDivElement; img: HTMLImageElement } => {
    const pooled = markerElPoolRef.current.pop();
    if (pooled) {
      const meta = FILTER_MARKER_MAP[filter];
      pooled.img.src = isSelected ? meta.selectedSrc : meta.src;
      return pooled;
    }
    return createStoreMarkerElements(store, filter, isSelected);
  };

  const releaseMarkerDomToPool = (root: HTMLDivElement, img: HTMLImageElement) => {
    if (markerElPoolRef.current.length >= MAX_MARKER_POOL) return;
    markerElPoolRef.current.push({ root, img });
  };

  const pickListenerAttachedRef = useRef(false);
  const mapInitMeasuredRef = useRef(false);
  const mapFirstIdleMeasuredRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      mapSizeRef.current = {
        w: Math.max(1, Math.round(rect.width)),
        h: Math.max(1, Math.round(rect.height))
      };
    });
    ro.observe(el);
    const rect = el.getBoundingClientRect();
    mapSizeRef.current = {
      w: Math.max(1, Math.round(rect.width)),
      h: Math.max(1, Math.round(rect.height))
    };
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (kakaoAppKey) startKakaoMapsWarmup(kakaoAppKey);
  }, [kakaoAppKey]);

  /**
   * SDK 훅(isLoading)과 무관하게 마운트 직후 지도 생성 — 타일 fetch LCP 앞당김.
   * geolocation·매장 데이터는 center/stores prop 으로만 반영(생성 전 대기 없음).
   */
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    let cancelled = false;

    const attachMapListeners = (map: KakaoMap) => {
      if (idleAttachedRef.current || !window.kakao?.maps) return;
      const kakao = window.kakao.maps;
      idleAttachedRef.current = true;

      const onIdle = () => {
        if (idleBoundTimerRef.current) clearTimeout(idleBoundTimerRef.current);
        idleBoundTimerRef.current = setTimeout(() => {
          try {
            const b = map.getBounds();
            const sw = b.getSouthWest();
            const ne = b.getNorthEast();
            const swLat = sw.getLat();
            const swLng = sw.getLng();
            const neLat = ne.getLat();
            const neLng = ne.getLng();
            const pad = 0.11;
            const dLat = (neLat - swLat) * pad;
            const dLng = (neLng - swLng) * pad;
            const round = (v: number) => Math.round(v * 1e5) / 1e5;
            const next: MapBoundsBox = {
              swLat: round(swLat - dLat),
              swLng: round(swLng - dLng),
              neLat: round(neLat + dLat),
              neLng: round(neLng + dLng)
            };
            setMapBounds((prev) => {
              if (
                prev &&
                prev.swLat === next.swLat &&
                prev.swLng === next.swLng &&
                prev.neLat === next.neLat &&
                prev.neLng === next.neLng
              ) {
                return prev;
              }
              return next;
            });
          } catch {
            /* bounds not ready */
          }
        }, 90);
      };
      idleHandlerRef.current = onIdle;
      kakao.event.addListener(map, "idle", onIdle);
      onIdle();

      onKakaoMapTilesLoadedOnce(map, () => {
        if (mapFirstIdleMeasuredRef.current) return;
        mapFirstIdleMeasuredRef.current = true;
        perfTimeEnd("[perf] map-first-idle");
      });

      const onMapClick = (...args: unknown[]) => {
        const mouseEvent = args[0] as { latLng: { getLat: () => number; getLng: () => number } };
        if (!mouseEvent?.latLng) return;

        const list = storesPickRef.current;
        if (!list.length) return;

        const proj = map.getProjection();
        if (!proj?.pointFromCoords) return;

        const clickLat = mouseEvent.latLng.getLat();
        const clickLng = mouseEvent.latLng.getLng();
        const clickXY = mapPointToXY(proj.pointFromCoords(mouseEvent.latLng));

        let latRadius = 0.005;
        let lngRadius = 0.005;
        try {
          const b = map.getBounds();
          const sw = b.getSouthWest();
          const ne = b.getNorthEast();
          const mapWidthPx = mapSizeRef.current.w;
          const mapHeightPx = mapSizeRef.current.h;
          const pxPerLat = mapHeightPx / Math.max(1e-6, ne.getLat() - sw.getLat());
          const pxPerLng = mapWidthPx / Math.max(1e-6, ne.getLng() - sw.getLng());
          latRadius = (STORE_PICK_MAX_DISTANCE_PX / pxPerLat) * 1.2;
          lngRadius = (STORE_PICK_MAX_DISTANCE_PX / pxPerLng) * 1.2;
        } catch {
          /* bounds not ready */
        }

        let best: StoreData | null = null;
        let bestDist = Infinity;

        for (const store of list) {
          const lat = Number(store.lat);
          const lng = Number(store.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          if (Math.abs(lat - clickLat) > latRadius) continue;
          if (Math.abs(lng - clickLng) > lngRadius) continue;

          const mXY = mapPointToXY(proj.pointFromCoords(new kakao.LatLng(lat, lng)));
          const d = Math.hypot(mXY.x - clickXY.x, mXY.y - clickXY.y);
          if (d <= STORE_PICK_MAX_DISTANCE_PX && d < bestDist) {
            bestDist = d;
            best = store;
          }
        }

        if (best) {
          onSelectStoreRef.current(best);
        }
      };

      if (!pickListenerAttachedRef.current) {
        pickListenerAttachedRef.current = true;
        kakao.event.addListener(map, "click", onMapClick);
      }
    };

    const createMap = () => {
      if (cancelled || mapRef.current || !containerRef.current || !window.kakao?.maps) {
        return;
      }
      const kakao = window.kakao.maps;
      perfTimeStart("[perf] map-init");
      perfTimeStart("[perf] map-first-idle");
      mapRef.current = createKakaoMap(containerRef.current, {
        center: new kakao.LatLng(Number(center.lat), Number(center.lng)),
        level: 5
      });
      perfTimeEnd("[perf] map-init");
      mapInitMeasuredRef.current = true;
      prevCenterRef.current = { lat: Number(center.lat), lng: Number(center.lng) };
      attachMapListeners(mapRef.current);
    };

    const bootMap = () => {
      if (cancelled || !window.kakao?.maps) return;
      runKakaoMapsLoad(() => createMap());
    };

    if (window.kakao?.maps) {
      bootMap();
    } else if (kakaoAppKey) {
      void ensureKakaoMapsReady(kakaoAppKey).then(() => bootMap());
    }

    const onSdkReady = () => bootMap();
    window.addEventListener(KAKAO_MAPS_READY_EVENT, onSdkReady);
    const pollId = window.setInterval(() => {
      if (window.kakao?.maps) {
        window.clearInterval(pollId);
        bootMap();
      }
    }, 50);

    return () => {
      cancelled = true;
      window.removeEventListener(KAKAO_MAPS_READY_EVENT, onSdkReady);
      window.clearInterval(pollId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 1회 지도·리스너 생성(초기 center만)
  }, []);

  useEffect(() => {
    return () => {
      if (idleBoundTimerRef.current) clearTimeout(idleBoundTimerRef.current);
      const map = mapRef.current;
      const h = idleHandlerRef.current;
      if (map && h && typeof window !== "undefined" && window.kakao?.maps) {
        window.kakao.maps.event.removeListener(map, "idle", h);
      }
      idleAttachedRef.current = false;
      idleHandlerRef.current = null;
    };
  }, []);

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

  /**
   * 변경 전: visible 목록 변경 시 전체 오버레이 `setMap(null)` 후 재생성 → idle마다 레이아웃·DOM 비용 폭증.
   * 변경 후: id별 add / position·아이콘 update / 불필요 id remove 만 수행(CustomOverlay 유지).
   * [INP 추가 변경] selectedStoreId 를 의존성에서 제거 — 선택 강조는 아래 별도 effect 가 1~2개 마커만 변경.
   * 측정: "[perf] map-markers-diff" 구간 ms, idle 루프당 Scripting 시간.
   */
  const selectedStoreIdRef = useRef<string | null | undefined>(selectedStoreId);
  selectedStoreIdRef.current = selectedStoreId;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.kakao?.maps) return;

    perfTimeStart("[perf] map-markers-diff");
    const kakao = window.kakao.maps;
    const desired = new Set(visibleForMarkers.map((s) => s.id));
    const cur = storeOverlayMapRef.current;
    const selId = selectedStoreIdRef.current;

    for (const id of [...cur.keys()]) {
      if (!desired.has(id)) {
        const ent = cur.get(id)!;
        ent.overlay.setMap(null);
        const root = ent.img.parentElement;
        if (root instanceof HTMLDivElement) {
          releaseMarkerDomToPool(root, ent.img);
        }
        cur.delete(id);
      }
    }

    const meta = FILTER_MARKER_MAP[activeFilter];

    for (const store of visibleForMarkers) {
      const lat = Number(store.lat);
      const lng = Number(store.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const isSelected = selId != null && store.id === selId;
      const entry = cur.get(store.id);

      if (!entry) {
        const { root, img } = acquireMarkerDom(store, activeFilter, isSelected);
        const overlay = new kakao.CustomOverlay({
          map,
          position: new kakao.LatLng(lat, lng),
          content: root,
          xAnchor: 0.5,
          yAnchor: 0.5,
          zIndex: isSelected ? 100 : 1,
          clickable: false
        });
        cur.set(store.id, { overlay, img });
      } else {
        entry.overlay.setPosition(new kakao.LatLng(lat, lng));
        entry.img.src = isSelected ? meta.selectedSrc : meta.src;
        entry.overlay.setZIndex(isSelected ? 100 : 1);
      }
    }

    perfTimeEnd("[perf] map-markers-diff");
  }, [visibleForMarkers, activeFilter]);

  /**
   * [INP] selectedStoreId 만 바뀌었을 때: 이전 선택과 현재 선택 마커 두 개만 src/zIndex 변경.
   * 전체 visibleForMarkers 재정렬·diff 가 일어나지 않음 → 클릭 next-paint 비용 대폭 감소.
   */
  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    const cur = storeOverlayMapRef.current;
    const meta = FILTER_MARKER_MAP[activeFilter];
    const prevId = prevSelectedRef.current;
    const nextId = selectedStoreId ?? null;
    if (prevId === nextId) return;

    if (prevId) {
      const prev = cur.get(prevId);
      if (prev) {
        prev.img.src = meta.src;
        if (typeof prev.overlay.setZIndex === "function") prev.overlay.setZIndex(1);
      }
    }
    if (nextId) {
      const next = cur.get(nextId);
      if (next) {
        next.img.src = meta.selectedSrc;
        if (typeof next.overlay.setZIndex === "function") next.overlay.setZIndex(100);
      }
    }
    prevSelectedRef.current = nextId;
  }, [selectedStoreId, activeFilter]);

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

  return (
    <div ref={containerRef} className="kakao-map-root relative z-[1] h-full min-h-0 w-full" />
  );
}

const MapView = memo(MapViewInner);
export default MapView;
