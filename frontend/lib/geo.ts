import { LatLng, SearchBounds } from "@/lib/types";

export function isPointInBounds(point: LatLng, bounds: SearchBounds): boolean {
  return (
    point.lat >= bounds.swLat &&
    point.lat <= bounds.neLat &&
    point.lng >= bounds.swLng &&
    point.lng <= bounds.neLng
  );
}
