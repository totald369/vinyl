import type { AddressSearchResult } from "@/lib/kakao/addressSearch";

type AddressSearchResponse = {
  success: boolean;
  error?: string;
  results: AddressSearchResult[];
};

export async function searchAddress(query: string): Promise<AddressSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const response = await fetch(`/api/kakao/address-search?query=${encodeURIComponent(q)}`);
  const json = (await response.json()) as AddressSearchResponse;

  if (!response.ok || !json.success) {
    throw new Error(json.error ?? "주소 검색 실패");
  }

  return json.results;
}

