declare global {
  interface Window {
    kakao: {
      maps: {
        load: (callback: () => void) => void;
        LatLng: new (lat: number, lng: number) => {
          getLat: () => number;
          getLng: () => number;
          toCoords: () => { getX: () => number; getY: () => number };
        };
        Map: new (
          container: HTMLElement,
          options: { center: { getLat: () => number; getLng: () => number }; level: number }
        ) => KakaoMap;
        Size: new (w: number, h: number) => { getWidth: () => number; getHeight: () => number };
        Point: new (x: number, y: number) => unknown;
        MarkerImage: new (
          src: string,
          size: { getWidth: () => number; getHeight: () => number },
          options?: { offset?: unknown }
        ) => unknown;
        Marker: new (options: {
          position: { getLat: () => number; getLng: () => number };
          map: KakaoMap;
          image?: unknown;
          zIndex?: number;
        }) => KakaoMarker;
        CustomOverlay: new (options: {
          map?: KakaoMap;
          position: { getLat: () => number; getLng: () => number };
          content: HTMLElement;
          xAnchor?: number;
          yAnchor?: number;
          zIndex?: number;
          clickable?: boolean;
        }) => KakaoCustomOverlay;
        event: {
          addListener: (
            target: KakaoMap | KakaoMarker | KakaoCustomOverlay,
            eventName: string,
            callback: (...args: unknown[]) => void
          ) => void;
          removeListener: (
            target: KakaoMap | KakaoMarker | KakaoCustomOverlay,
            eventName: string,
            callback: (...args: unknown[]) => void
          ) => void;
        };
      };
    };
  }
}

export type KakaoMapPoint = {
  getX: () => number;
  getY: () => number;
};

export type KakaoMapProjection = {
  pointFromCoords: (latLng: { getLat: () => number; getLng: () => number }) => KakaoMapPoint;
};

export type KakaoMap = {
  setCenter: (latLng: { getLat: () => number; getLng: () => number }) => void;
  setLevel: (level: number) => void;
  getCenter: () => { getLat: () => number; getLng: () => number };
  getProjection: () => KakaoMapProjection;
  getBounds: () => {
    getSouthWest: () => { getLat: () => number; getLng: () => number };
    getNorthEast: () => { getLat: () => number; getLng: () => number };
  };
  panTo: (latLng: { getLat: () => number; getLng: () => number }) => void;
};

export type KakaoMarker = {
  setMap: (map: KakaoMap | null) => void;
  setPosition: (pos: { getLat: () => number; getLng: () => number }) => void;
  getPosition: () => { getLat: () => number; getLng: () => number };
  setImage: (image: unknown) => void;
  setZIndex: (z: number) => void;
};

export type KakaoCustomOverlay = {
  setMap: (map: KakaoMap | null) => void;
  setZIndex: (z: number) => void;
};

export {};
