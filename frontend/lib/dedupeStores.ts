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

/** 괄호·공백 제거 후 비교 (CU(광주오포대주점) ≡ CU 광주오포대주점) */
function normalizeBizName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFC")
    .replace(/[()（）\[\]]/g, "")
    .replace(/\s+/g, "");
}

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

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function haversineKmStores(a: MergeableStore, b: MergeableStore): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const MAX_GROUP_FOR_PAIRWISE = 350;

/**
 * 동일 상호(표기만 다른 경우 포함)이면서 좌표가 가까우면 한 건으로 합칩니다.
 * 공공데이터 + 제보 중복에 사용합니다.
 */
export function dedupeStoresByBizNameProximity<T extends MergeableStore>(
  stores: T[],
  maxKm = 0.5
): T[] {
  const byBiz = new Map<string, T[]>();
  for (const s of stores) {
    const biz = normalizeBizName(s.name);
    const key = biz.length > 0 ? biz : `\0id:${s.id}`;
    if (!byBiz.has(key)) byBiz.set(key, []);
    byBiz.get(key)!.push(s);
  }

  const out: T[] = [];

  for (const group of byBiz.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }

    if (group.length > MAX_GROUP_FOR_PAIRWISE) {
      for (const s of group) out.push(s);
      continue;
    }

    const n = group.length;
    const parent = Array.from({ length: n }, (_, i) => i);

    function find(x: number): number {
      if (parent[x] !== x) parent[x] = find(parent[x]);
      return parent[x];
    }
    function union(x: number, y: number) {
      const px = find(x);
      const py = find(y);
      if (px !== py) parent[px] = py;
    }

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (haversineKmStores(group[i], group[j]) <= maxKm) union(i, j);
      }
    }

    const components = new Map<number, T[]>();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!components.has(r)) components.set(r, []);
      components.get(r)!.push(group[i]);
    }

    for (const cluster of components.values()) {
      out.push(
        cluster.length === 1 ? cluster[0] : mergeClusterStores(cluster)
      );
    }
  }

  return out;
}

function mergeClusterStores<T extends MergeableStore>(cluster: T[]): T {
  const sorted = [...cluster].sort((a, b) => {
    const aRep = a.id.startsWith("report:");
    const bRep = b.id.startsWith("report:");
    if (aRep !== bRep) return aRep ? 1 : -1;
    return (b.roadAddress || "").length - (a.roadAddress || "").length;
  });
  return sorted.reduce((acc, cur) => mergeTwoStores(acc, cur));
}

function mergeTwoStores<T extends MergeableStore>(a: T, b: T): T {
  const longerRoad = (a.roadAddress || "").length >= (b.roadAddress || "").length;
  const base = (longerRoad ? a : b) as T;
  const other = (longerRoad ? b : a) as T;
  const longerAddr = (a.address || "").length >= (b.address || "").length;

  const preferId =
    !a.id.startsWith("report:") && b.id.startsWith("report:")
      ? a.id
      : a.id.startsWith("report:") && !b.id.startsWith("report:")
        ? b.id
        : base.id;

  return {
    ...base,
    id: preferId,
    roadAddress: longerRoad ? base.roadAddress : other.roadAddress,
    address: longerAddr ? a.address : b.address,
    hasTrashBag: base.hasTrashBag || other.hasTrashBag,
    hasSpecialBag: base.hasSpecialBag || other.hasSpecialBag,
    hasLargeWasteSticker:
      base.hasLargeWasteSticker || other.hasLargeWasteSticker,
    adminVerified: !!(base.adminVerified || other.adminVerified),
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
