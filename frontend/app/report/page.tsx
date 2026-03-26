"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import LocationPickerMap from "@/components/map/LocationPickerMap";
import type { AddressSearchResult } from "@/lib/kakao/addressSearch";
import { searchAddress } from "@/lib/services/addressSearch";
import { supabase } from "@/lib/supabaseClient";
import { DEFAULT_REGION, FILTER_LABELS, FilterType, LatLng } from "@/lib/types";

const itemOrder: FilterType[] = ["PAY_AS_YOU_THROW", "NON_BURNABLE_BAG", "WASTE_STICKER"];
type SelectedAddressState = {
  name: string;
  roadAddress: string;
  jibunAddress: string;
  lat: number;
  lng: number;
};

export default function ReportPage() {
  const router = useRouter();
  const [location, setLocation] = useState<LatLng>({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng });
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [selectedItems, setSelectedItems] = useState<FilterType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [addressResults, setAddressResults] = useState<AddressSearchResult[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [addressSearchError, setAddressSearchError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<SelectedAddressState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fullAddress = useMemo(
    () => (addressDetail.trim() ? `${address} ${addressDetail}`.trim() : address.trim()),
    [address, addressDetail]
  );
  const resolvedStoreName = useMemo(() => {
    const picked = selectedPlace?.name?.trim();
    if (picked) return picked;
    return address.trim();
  }, [address, selectedPlace]);
  const submitting = isLoading;
  const canSubmit = fullAddress.trim().length > 0 && !submitting;

  const toggleItem = (item: FilterType) => {
    setSelectedItems((prev) => (prev.includes(item) ? prev.filter((v) => v !== item) : [...prev, item]));
  };

  useEffect(() => {
    const q = address.trim();
    if (q.length < 2) {
      setAddressResults([]);
      setAddressSearchError(null);
      setSearchingAddress(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setSearchingAddress(true);
        setAddressSearchError(null);
        const results = await searchAddress(q);
        setAddressResults(results);
      } catch (e) {
        setAddressResults([]);
        setAddressSearchError(e instanceof Error ? e.message : "주소 검색 중 오류가 발생했습니다.");
      } finally {
        setSearchingAddress(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [address]);

  const handleSubmit = async () => {
    if (!resolvedStoreName.trim()) {
      setError("업체명을 입력해주세요.");
      return;
    }

    if (!selectedPlace || !(selectedPlace.roadAddress || selectedPlace.jibunAddress)) {
      setError("주소 검색 결과에서 주소를 선택해주세요.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const message = selectedItems.map((item) => FILTER_LABELS[item]).join(", ");
    const payload = {
      report_type: "new_store" as const,
      store_id: null as string | null,
      name: resolvedStoreName,
      road_address: selectedPlace.roadAddress || selectedPlace.jibunAddress,
      detail_address: addressDetail.trim(),
      lat: selectedPlace?.lat ?? null,
      lng: selectedPlace?.lng ?? null,
      has_trash_bag: selectedItems.includes("PAY_AS_YOU_THROW"),
      has_special_bag: selectedItems.includes("NON_BURNABLE_BAG"),
      has_large_waste_sticker: selectedItems.includes("WASTE_STICKER"),
      message
    };

    console.log("[report submit] payload:", payload);

    try {
      const response = await supabase.from("reports").insert([payload]);
      console.log("[report submit] supabase response:", response);
      console.log("[report submit] supabase error:", response.error);

      const insertError = response.error;
      if (insertError) {
        console.error("[report submit] supabase insert error:", insertError);
        setIsLoading(false);
        setError(insertError.message || "제보 등록 중 오류가 발생했습니다.");
        return;
      }

      setIsLoading(false);
      router.push("/report/success");
    } catch (e) {
      console.error("[report submit] unexpected error:", e);
      setIsLoading(false);
      setError(e instanceof Error ? e.message : "제보 등록 중 오류가 발생했습니다.");
      return;
    }
  };

  return (
    <main className="mx-auto flex h-screen max-w-md flex-col overflow-hidden bg-white">
      <header className="z-[6] flex h-14 w-full shrink-0 items-center gap-1 overflow-hidden bg-white px-2">
        <div className="size-12 opacity-0" aria-hidden />
        <h1 className="min-w-0 flex-1 text-center text-[16px] font-bold leading-6 text-[#171717]">제보하기</h1>
        <Link href="/" className="flex size-12 items-center justify-center" aria-label="닫기">
          <img src="/Img/Icon/close_32.svg" alt="" width={32} height={32} className="size-8" />
        </Link>
      </header>
      <div className="relative z-[1] mb-8 min-h-0 flex-1">
        <LocationPickerMap
          value={location}
          onChange={setLocation}
          selectedMarkerPosition={selectedPlace ? { lat: selectedPlace.lat, lng: selectedPlace.lng } : null}
          className="relative h-full"
          mapClassName="h-full w-full border-0 rounded-none"
        />
      </div>

      <section className="z-[7] flex shrink-0 flex-col bg-white pb-2">
        <div className="flex flex-col gap-4 px-4 pb-2 pt-0">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <p className="text-[36px] font-bold leading-6 tracking-[0.1px] text-[#171717] [font-size:20px]">
                새로 등록할 업체를 검색해주세요.
              </p>
              <p className="text-[16px] font-normal leading-[1.4] text-[#555555]">
                지도를 움직여서 위치를 지정할 수 있어요.
              </p>
            </div>
            <div className="relative flex flex-col gap-2">
              <div className="flex h-12 items-center gap-1 rounded-[8px] border border-[#dddddd] bg-white py-2 pl-3 pr-4">
                <img src="/Img/Icon/search_24.svg" alt="" width={24} height={24} className="size-6 shrink-0" />
                <input
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setSelectedPlace(null);
                  }}
                  className="min-w-0 flex-1 bg-transparent text-[16px] font-normal leading-normal tracking-[-0.3px] text-[#171717] outline-none placeholder:text-[#999999]"
                  placeholder="주소나 업체명을 검색해주세요"
                />
              </div>
              {searchingAddress || addressSearchError || addressResults.length > 0 ? (
                <div className="absolute left-0 right-0 top-[52px] z-20 overflow-hidden rounded-[8px] border border-[#dddddd] bg-white shadow-[0px_5px_15px_0px_rgba(0,0,0,0.16),0px_0px_2px_0px_rgba(0,0,0,0.08)]">
                  {searchingAddress ? <p className="px-3 py-2 text-[14px] text-[#555555]">주소 검색 중...</p> : null}
                  {addressSearchError ? <p className="px-3 py-2 text-[14px] text-danger-700">{addressSearchError}</p> : null}
                  {!searchingAddress &&
                  !addressSearchError &&
                  address.trim().length >= 2 &&
                  addressResults.length === 0 ? (
                    <p className="px-3 py-2 text-[14px] text-[#555555]">검색 결과가 없습니다.</p>
                  ) : null}
                  {addressResults.length > 0 ? (
                    <ul className="max-h-56 overflow-y-auto">
                      {addressResults.map((result, index) => {
                        const key = `${result.name}-${result.roadAddress}-${index}`;
                        const mainAddress = result.roadAddress || result.jibunAddress;
                        const title = result.name || mainAddress || "주소 결과";
                        return (
                          <li key={key}>
                            <button
                              type="button"
                              onClick={() => {
                                setAddress(mainAddress);
                                setSelectedPlace({
                                  name: result.name,
                                  roadAddress: result.roadAddress,
                                  jibunAddress: result.jibunAddress,
                                  lat: result.lat,
                                  lng: result.lng
                                });
                                setAddressResults([]);
                                setAddressSearchError(null);
                                setLocation({ lat: result.lat, lng: result.lng });
                              }}
                              className="w-full border-b border-border-subtle px-3 py-2 text-left last:border-b-0"
                            >
                              <p className="text-body-sm text-text-primary">{title}</p>
                              {result.roadAddress ? (
                                <p className="text-caption text-text-tertiary">{result.roadAddress}</p>
                              ) : null}
                              {result.jibunAddress ? (
                                <p className="text-caption text-text-tertiary">{result.jibunAddress}</p>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              <div className="flex h-12 items-center rounded-[8px] border border-[#dddddd] bg-white px-4 py-2">
                <input
                  value={addressDetail}
                  onChange={(e) => setAddressDetail(e.target.value)}
                  className="w-full bg-transparent text-[16px] font-normal leading-normal tracking-[-0.3px] text-[#171717] outline-none placeholder:text-[#999999]"
                  placeholder="상세 주소(선택)"
                />
              </div>
            </div>
          </div>

          {selectedPlace ? (
            <p className="text-caption text-text-tertiary">
              선택됨: {selectedPlace.roadAddress || selectedPlace.jibunAddress}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <div className="flex items-center">
              <p className="text-[14px] font-bold leading-[1.5] text-[#171717]">판매물품</p>
              <img src="/Img/Icon/info_24.svg" alt="" width={24} height={24} className="size-6" />
            </div>
            <div className="flex gap-1">
              {itemOrder.map((item) => {
                const active = selectedItems.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleItem(item)}
                    className={`flex h-12 flex-1 items-center justify-center rounded-[8px] px-2 py-3 text-[16px] font-bold leading-[1.5] ${
                      active
                        ? "bg-[#171717] text-[#d4fe1c]"
                        : "border border-[#dddddd] bg-white text-[#171717]"
                    }`}
                  >
                    {item === "NON_BURNABLE_BAG" ? "불연성마대" : FILTER_LABELS[item]}
                  </button>
                );
              })}
            </div>
          </div>

          {error ? <p className="text-body-sm text-danger-700">{error}</p> : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`h-12 w-full rounded-[8px] px-4 py-2 text-center text-[16px] font-bold leading-[1.5] ${
              canSubmit ? "bg-[#171717] text-[#d4fe1c]" : "bg-[#e0e0e0] text-[#888888]"
            }`}
          >
            {submitting ? "제출 중..." : "제보하기"}
          </button>
        </div>
        <div className="h-[33px] w-full bg-white pb-[env(safe-area-inset-bottom,0px)]">
          <div className="relative mx-auto h-full w-[135px]">
            <span className="absolute bottom-2 left-1/2 h-[5px] w-[135px] -translate-x-1/2 rounded-[100px] bg-[#222222]" />
          </div>
        </div>
      </section>
    </main>
  );
}
