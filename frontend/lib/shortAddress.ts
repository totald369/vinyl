/** 리스트·검색 등에 쓰는 짧은 지역 문자열 (앞 3어절) */
export function shortRegion(address: string): string {
  const parts = address.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 3) return parts.join(" ");
  return parts.slice(0, 3).join(" ");
}
