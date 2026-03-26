export type AddressSearchResult = {
  name: string;
  roadAddress: string;
  jibunAddress: string;
  lat: number;
  lng: number;
};

type KakaoKeywordDoc = {
  place_name?: string;
  road_address_name?: string;
  address_name?: string;
  y?: string;
  x?: string;
};

type KakaoAddressDoc = {
  road_address?: {
    address_name?: string;
  };
  address?: {
    address_name?: string;
  };
  y?: string;
  x?: string;
};

function toNumber(value: string | undefined): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeKeywordDoc(doc: KakaoKeywordDoc): AddressSearchResult | null {
  const lat = toNumber(doc.y);
  const lng = toNumber(doc.x);
  if (lat == null || lng == null) return null;

  const roadAddress = doc.road_address_name?.trim() || "";
  const jibunAddress = doc.address_name?.trim() || "";
  const fallbackName = roadAddress || jibunAddress || "이름 미상";

  return {
    name: doc.place_name?.trim() || fallbackName,
    roadAddress,
    jibunAddress,
    lat,
    lng
  };
}

function normalizeAddressDoc(doc: KakaoAddressDoc): AddressSearchResult | null {
  const lat = toNumber(doc.y);
  const lng = toNumber(doc.x);
  if (lat == null || lng == null) return null;

  const roadAddress = doc.road_address?.address_name?.trim() || "";
  const jibunAddress = doc.address?.address_name?.trim() || "";
  const name = roadAddress || jibunAddress || "이름 미상";

  return {
    name,
    roadAddress,
    jibunAddress,
    lat,
    lng
  };
}

async function fetchKakao<T>(path: string, query: string, size: number, restKey: string): Promise<T[]> {
  const url = new URL(`https://dapi.kakao.com/v2/local/search/${path}`);
  url.searchParams.set("query", query);
  url.searchParams.set("size", String(size));

  const response = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${restKey}` },
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`카카오 주소 검색 실패(${response.status}): ${text || "unknown error"}`);
  }

  const json = (await response.json()) as { documents?: T[] };
  return Array.isArray(json.documents) ? json.documents : [];
}

function mergeAddressResults(results: AddressSearchResult[]): AddressSearchResult[] {
  const map = new Map<string, AddressSearchResult>();

  for (const item of results) {
    const key = `${item.lat.toFixed(6)}:${item.lng.toFixed(6)}:${item.roadAddress || item.jibunAddress}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, item);
      continue;
    }

    map.set(key, {
      name: prev.name || item.name,
      roadAddress: prev.roadAddress || item.roadAddress,
      jibunAddress: prev.jibunAddress || item.jibunAddress,
      lat: prev.lat,
      lng: prev.lng
    });
  }

  return [...map.values()];
}

export async function searchAddressByKakao(query: string, options?: { size?: number }): Promise<AddressSearchResult[]> {
  const restKey = process.env.KAKAO_REST_API_KEY ?? "";
  if (!restKey) {
    throw new Error("KAKAO_REST_API_KEY가 설정되지 않았습니다.");
  }

  const q = query.trim();
  if (!q) return [];

  const size = options?.size ?? 8;
  const [keywordDocs, addressDocs] = await Promise.all([
    fetchKakao<KakaoKeywordDoc>("keyword.json", q, size, restKey),
    fetchKakao<KakaoAddressDoc>("address.json", q, size, restKey)
  ]);

  const keywordResults = keywordDocs
    .map(normalizeKeywordDoc)
    .filter((v): v is AddressSearchResult => v !== null);
  const addressResults = addressDocs
    .map(normalizeAddressDoc)
    .filter((v): v is AddressSearchResult => v !== null);

  return mergeAddressResults([...keywordResults, ...addressResults]);
}

