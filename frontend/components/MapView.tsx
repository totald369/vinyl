"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { StoreData, StoreListFilter } from "@/hooks/useStores";
import type { KakaoMap, KakaoMapPoint, KakaoMarker } from "@/lib/kakao";
import {
  createKakaoMap,
  notifyKakaoMapReady,
  onKakaoMapFirstIdleOnce,
  onKakaoMapTilesLoadedOnce,
  relayoutKakaoMap,
  runKakaoMapsLoad
} from "@/lib/kakao/createKakaoMap";
import {
  getStoreMarkerImages,
  isKakaoMapsConstructorsReady
} from "@/lib/kakao/storeMarkerImages";
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

const STORE_PICK_MAX_DISTANCE_PX = 58;

/** Before first bounds, cap markers so tiles + LCP stay ahead */
const PRIORITIZE_BEFORE_BOUNDS = 40;
/** Hard cap on markers per rebuild */
const MAX_MAP_MARKERS = 240;

type MapBoundsBox = { swLat: number; swLng: number; neLat: number; neLng: number };

function mapPointToXY(pt: KakaoMapPoint | { x: number; y: number }): { x: number; y: number } {
  if ("getX" in pt && typeof pt.getX === "function" && typeof pt.getY === "function") {
    return { x: pt.getX(), y: pt.getY() };
  }
  const p = pt as { x: number; y: number };
  return { x: p.x, y: p.y };
}

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

  /** bounds 직후·중심 불일치 시 빈 pool 방지 → 가까운 N개라도 표시 */
  if (pool.length === 0 && stores.length > 0) {
    pool = [...stores]
      .map((s) => ({
        s,
        d: getDistanceKm(mapCenter.lat, mapCenter.lng, s.lat, s.lng)
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, PRIORITIZE_BEFORE_BOUNDS)
      .map((x) => x.s);
  } else if (bounds == null && pool.length > PRIORITIZE_BEFORE_BOUNDS) {
    pool = [...stores]
      .map((s) => ({
        s,
        d: getDistanceKm(mapCenter.lat, mapCenter.lng, s.lat, s.lng)
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, PRIORITIZE_BEFORE_BOUNDS)
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
  const storeMarkersRef = useRef<Map<string, KakaoMarker>>(new Map());
  const markerClickBoundRef = useRef<Set<string>>(new Set());
  const userMarkerRef = useRef<KakaoMarker | null>(null);
  const prevCenterRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevCenterVersionRef = useRef(0);
  const activeFilterRef = useRef<StoreListFilter>(activeFilter);
  activeFilterRef.current = activeFilter;

  const onSelectStoreRef = useRef(onSelectStore);
  onSelectStoreRef.current = onSelectStore;

  const [mapBounds, setMapBounds] = useState<MapBoundsBox | null>(null);
  const [mapInstanceReady, setMapInstanceReady] = useState(false);
  const [markerSdkReady, setMarkerSdkReady] = useState(false);
  const idleBoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleHandlerRef = useRef<(() => void) | null>(null);
  const idleAttachedRef = useRef(false);
  const firstIdleCleanupRef = useRef<(() => void) | null>(null);

  const centerLat = Number(center.lat);
  const centerLng = Number(center.lng);
  const mbSwLat = mapBounds?.swLat;
  const mbSwLng = mapBounds?.swLng;
  const mbNeLat = mapBounds?.neLat;
  const mbNeLng = mapBounds?.neLng;

  const baseVisibleForMarkers = useMemo(() => {
    const boundsBox =
      mbSwLat != null && mbSwLng != null && mbNeLat != null && mbNeLng != null
        ? { swLat: mbSwLat, swLng: mbSwLng, neLat: mbNeLat, neLng: mbNeLng }
        : null;
    return pickStoresForMapMarkers(stores, { lat: centerLat, lng: centerLng }, boundsBox);
  }, [stores, centerLat, centerLng, mbSwLat, mbSwLng, mbNeLat, mbNeLng]);

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

  const mapClickHandlerRef = useRef<((...args: unknown[]) => void) | null>(null);
  const mapFirstIdleMeasuredRef = useRef(false);
  const lastLayoutSizeRef = useRef({ w: 0, h: 0 });
  const relayoutRafRef = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const applySize = (w: number, h: number, relayout: boolean) => {
      const nw = Math.max(1, Math.round(w));
      const nh = Math.max(1, Math.round(h));
      mapSizeRef.current = { w: nw, h: nh };
      if (!relayout) return;
      const map = mapRef.current;
      if (!map) return;
      if (lastLayoutSizeRef.current.w === nw && lastLayoutSizeRef.current.h === nh) {
        return;
      }
      lastLayoutSizeRef.current = { w: nw, h: nh };
      cancelAnimationFrame(relayoutRafRef.current);
      relayoutRafRef.current = requestAnimationFrame(() => {
        if (mapRef.current) relayoutKakaoMap(mapRef.current);
      });
    };

    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      applySize(rect.width, rect.height, true);
    });
    ro.observe(el);
    applySize(el.clientWidth, el.clientHeight, false);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(relayoutRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (kakaoAppKey) startKakaoMapsWarmup(kakaoAppKey);
  }, [kakaoAppKey]);

  useEffect(() => {
    if (isKakaoMapsConstructorsReady()) {
      setMarkerSdkReady(true);
      return;
    }
    const onSdkReady = () => {
      if (isKakaoMapsConstructorsReady()) setMarkerSdkReady(true);
    };
    window.addEventListener(KAKAO_MAPS_READY_EVENT, onSdkReady);
    return () => window.removeEventListener(KAKAO_MAPS_READY_EVENT, onSdkReady);
  }, []);

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

      firstIdleCleanupRef.current = onKakaoMapFirstIdleOnce(map, () => undefined);

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

      if (!mapClickHandlerRef.current) {
        mapClickHandlerRef.current = onMapClick;
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
      prevCenterRef.current = { lat: Number(center.lat), lng: Number(center.lng) };
      setMapInstanceReady(true);
      if (isKakaoMapsConstructorsReady()) setMarkerSdkReady(true);
      notifyKakaoMapReady();
      attachMapListeners(mapRef.current);
      requestAnimationFrame(() => {
        if (mapRef.current) relayoutKakaoMap(mapRef.current);
      });
    };

    const bootMap = () => {
      if (cancelled || !window.kakao?.maps) return;
      runKakaoMapsLoad(() => createMap());
    };

    const onSdkReady = () => bootMap();
    window.addEventListener(KAKAO_MAPS_READY_EVENT, onSdkReady);

    if (kakaoAppKey) {
      void ensureKakaoMapsReady(kakaoAppKey).then(() => bootMap());
    }

    return () => {
      cancelled = true;
      window.removeEventListener(KAKAO_MAPS_READY_EVENT, onSdkReady);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 1회 지도·리스너 생성(초기 center만)
  }, []);

  useEffect(() => {
    return () => {
      if (idleBoundTimerRef.current) clearTimeout(idleBoundTimerRef.current);
      firstIdleCleanupRef.current?.();
      firstIdleCleanupRef.current = null;
      const map = mapRef.current;
      const h = idleHandlerRef.current;
      if (map && h && typeof window !== "undefined" && window.kakao?.maps) {
        window.kakao.maps.event.removeListener(map, "idle", h);
      }
      idleAttachedRef.current = false;
      idleHandlerRef.current = null;
      const mapClick = mapClickHandlerRef.current;
      if (map && mapClick && window.kakao?.maps) {
        window.kakao.maps.event.removeListener(map, "click", mapClick);
      }
      mapClickHandlerRef.current = null;
      storeMarkersRef.current.forEach((m) => m.setMap(null));
      storeMarkersRef.current.clear();
      markerClickBoundRef.current.clear();
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

  const selectedStoreIdRef = useRef<string | null | undefined>(selectedStoreId);
  selectedStoreIdRef.current = selectedStoreId;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInstanceReady || !markerSdkReady) return;

    perfTimeStart("[perf] map-markers-diff");
    const kakao = window.kakao!.maps;
    const desired = new Set(visibleForMarkers.map((s) => s.id));
    const cur = storeMarkersRef.current;
    const selId = selectedStoreIdRef.current;
    const images = getStoreMarkerImages(activeFilter);
    if (!images.normal || !images.selected) {
      perfTimeEnd("[perf] map-markers-diff");
      return;
    }
    for (const id of [...cur.keys()]) {
      if (!desired.has(id)) {
        cur.get(id)!.setMap(null);
        cur.delete(id);
        markerClickBoundRef.current.delete(id);
      }
    }

    const markerList: KakaoMarker[] = [];

    for (const store of visibleForMarkers) {
      const lat = Number(store.lat);
      const lng = Number(store.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const isSelected = selId != null && store.id === selId;
      const image = isSelected ? images.selected : images.normal;
      let marker = cur.get(store.id);

      if (!marker) {
        marker = new kakao.Marker({
          map,
          position: new kakao.LatLng(lat, lng),
          image,
          clickable: true,
          zIndex: isSelected ? 100 : 1
        });
        if (!markerClickBoundRef.current.has(store.id)) {
          markerClickBoundRef.current.add(store.id);
          const storeId = store.id;
          kakao.event.addListener(marker, "click", () => {
            const hit =
              storesPickRef.current.find((s) => s.id === storeId) ??
              stores.find((s) => s.id === storeId);
            if (hit) onSelectStoreRef.current(hit);
          });
        }
        cur.set(store.id, marker);
      } else {
        marker.setPosition(new kakao.LatLng(lat, lng));
        marker.setImage(image);
        marker.setZIndex(isSelected ? 100 : 1);
      }
      markerList.push(marker);
    }

    for (const marker of markerList) {
      marker.setMap(map);
    }

    perfTimeEnd("[perf] map-markers-diff");
  }, [visibleForMarkers, activeFilter, mapInstanceReady, markerSdkReady, stores.length]);

  const prevSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mapInstanceReady || !markerSdkReady) return;
    const cur = storeMarkersRef.current;
    const images = getStoreMarkerImages(activeFilter);
    if (!images.normal || !images.selected) return;
    const prevId = prevSelectedRef.current;
    const nextId = selectedStoreId ?? null;
    if (prevId === nextId) return;

    if (prevId) {
      const prev = cur.get(prevId);
      if (prev) {
        prev.setImage(images.normal);
        prev.setZIndex(1);
      }
    }
    if (nextId) {
      const next = cur.get(nextId);
      if (next) {
        next.setImage(images.selected);
        next.setZIndex(100);
      }
    }
    prevSelectedRef.current = nextId;
  }, [selectedStoreId, activeFilter, mapInstanceReady, markerSdkReady]);

  useEffect(() => {
    if (!mapRef.current || !mapInstanceReady || !markerSdkReady) return;

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
      userMarkerRef.current.setZIndex(200);
    }
  }, [userMarkerPosition, mapInstanceReady, markerSdkReady]);

  return (
    <div ref={containerRef} className="kakao-map-root relative z-[1] h-full min-h-0 w-full" />
  );
}

const MapView = memo(MapViewInner);
export default MapView;
