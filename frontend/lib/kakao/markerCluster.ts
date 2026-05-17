import type { KakaoMap, KakaoMarker } from "@/lib/kakao";

export type MarkerClustererLike = {
  clear: () => void;
  addMarkers: (markers: KakaoMarker[], nodraw?: boolean) => void;
  setMap: (map: KakaoMap | null) => void;
  redraw?: () => void;
};

export const CLUSTER_MIN_MARKERS = 80;

type ClustererCtor = new (opts: Record<string, unknown>) => MarkerClustererLike;

export function getMarkerClustererCtor(): ClustererCtor | null {
  if (typeof window === "undefined" || !window.kakao?.maps) return null;
  return (
    window.kakao.maps as typeof window.kakao.maps & {
      MarkerClusterer?: ClustererCtor;
    }
  ).MarkerClusterer ?? null;
}

type SyncOptions = {
  minLevel?: number;
  gridSize?: number;
};

/**
 * 마커 수가 많을 때 MarkerClusterer로 묶고, 적을 때는 지도에 직접 올린다.
 * clusterer 라이브러리 미로드 시 개별 Marker.setMap(map) 폴백.
 */
export function syncMarkersWithClusterer(
  map: KakaoMap,
  clustererRef: { current: MarkerClustererLike | null },
  markers: KakaoMarker[],
  useCluster: boolean,
  options: SyncOptions = {}
): void {
  const minLevel = options.minLevel ?? 7;
  const gridSize = options.gridSize ?? 50;

  if (!useCluster || markers.length < CLUSTER_MIN_MARKERS) {
    clustererRef.current?.clear?.();
    clustererRef.current?.setMap?.(null);
    clustererRef.current = null;
    for (const marker of markers) {
      marker.setMap(map);
    }
    return;
  }

  const ClustererCtor = getMarkerClustererCtor();
  if (!ClustererCtor) {
    clustererRef.current?.clear?.();
    clustererRef.current?.setMap?.(null);
    clustererRef.current = null;
    for (const marker of markers) {
      marker.setMap(map);
    }
    return;
  }

  for (const marker of markers) {
    marker.setMap(null);
  }

  if (!clustererRef.current) {
    clustererRef.current = new ClustererCtor({
      map,
      averageCenter: true,
      minLevel,
      gridSize,
      disableClickZoom: true,
      minClusterSize: 2,
      markers: []
    });
  }

  clustererRef.current.clear?.();
  clustererRef.current.addMarkers?.(markers);
  clustererRef.current.setMap?.(map);
  clustererRef.current.redraw?.();
}
