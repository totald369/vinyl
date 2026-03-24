export type PermissionState = "unknown" | "granted" | "denied";
export type ListMode = "defaultRegion" | "myLocation";
export type ContentState = "loading" | "ready" | "empty" | "error";
export type FilterType = "PAY_AS_YOU_THROW" | "NON_BURNABLE_BAG" | "WASTE_STICKER";
export type LatLng = { lat: number; lng: number };

export type StoreItem = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  products: FilterType[];
  phone?: string;
  description?: string;
  distanceKm?: number;
};

export type SearchBounds = {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
};

export const FILTER_LABELS: Record<FilterType, string> = {
  PAY_AS_YOU_THROW: "종량제 봉투",
  NON_BURNABLE_BAG: "불연성 마대",
  WASTE_STICKER: "폐기물 스티커"
};

export const DEFAULT_REGION = {
  name: "Gangnam",
  lat: 37.4979,
  lng: 127.0276
};
