/** useStores.StoreData 와 호환되는 행(중복 제거·병합용). */
export type MergeableStore = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  roadAddress?: string;
  address?: string;
  businessStatus?: string;
  hasTrashBag: boolean;
  hasSpecialBag: boolean;
  hasLargeWasteSticker: boolean;
  adminVerified?: boolean;
  dataReferenceDate?: string;
  distance?: number;
};

const COORD_DECIMALS = 5;

function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .normalize("NFC");
}

function roundCoord(n: number): number {
  const f = 10 ** COORD_DECIMALS;
  return Math.round(n * f) / f;
}

/** 동일 상호·동일 위치(지오코딩 오차 허용)로 보이는 행을 한 건으로 합칩니다. */
export function dedupeStoresByNameAndLocation<T extends MergeableStore>(
  stores: T[]
): T[] {
  const map = new Map<string, T>();

  for (const s of stores) {
    const key = `${normalizeName(s.name)}|${roundCoord(s.lat)}|${roundCoord(s.lng)}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, s);
      continue;
    }
    map.set(key, mergeTwoStores(prev, s));
  }

  return [...map.values()];
}

function mergeTwoStores<T extends MergeableStore>(a: T, b: T): T {
  const longerRoad = (a.roadAddress || "").length >= (b.roadAddress || "").length;
  const base = (longerRoad ? a : b) as T;
  const other = (longerRoad ? b : a) as T;
  const longerAddr = (a.address || "").length >= (b.address || "").length;

  return {
    ...base,
    roadAddress: longerRoad ? base.roadAddress : other.roadAddress,
    address: longerAddr ? a.address : b.address,
    hasTrashBag: base.hasTrashBag || other.hasTrashBag,
    hasSpecialBag: base.hasSpecialBag || other.hasSpecialBag,
    hasLargeWasteSticker:
      base.hasLargeWasteSticker || other.hasLargeWasteSticker,
    dataReferenceDate: pickNewerDate(
      base.dataReferenceDate,
      other.dataReferenceDate
    )
  };
}

function pickNewerDate(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a >= b ? a : b;
}
