"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { AddressSearchResult } from "@/lib/kakao/addressSearch";
import { mockStores } from "@/lib/mock";
import { searchAddress } from "@/lib/services/addressSearch";
import { getBrowserSupabaseClient } from "@/lib/supabase";
import { FILTER_LABELS, FilterType } from "@/lib/types";

type RequestType = "closed" | "items_changed" | "address_changed" | "other";

const reasons: Array<{ key: RequestType; label: string }> = [
  { key: "closed", label: "폐업했어요." },
  { key: "items_changed", label: "판매물품이 달라요." },
  { key: "address_changed", label: "주소가 달라요." },
  { key: "other", label: "기타" }
];

const itemOrder: FilterType[] = ["PAY_AS_YOU_THROW", "NON_BURNABLE_BAG", "WASTE_STICKER"];

function EditRequestContent() {
  const router = useRouter();
  const params = useSearchParams();
  const storeId = params.get("storeId") ?? "";
  const storeNameParam = params.get("storeName") ?? "";
  const storeAddressParam = params.get("storeAddress") ?? "";
  const [requestType, setRequestType] = useState<RequestType | null>(null);
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [note, setNote] = useState("");
  const [selectedItems, setSelectedItems] = useState<FilterType[]>([]);
  const [addressResults, setAddressResults] = useState<AddressSearchResult[]>([]);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [addressSearchError, setAddressSearchError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<AddressSearchResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkedStore = useMemo(() => mockStores.find((store) => store.id === storeId), [storeId]);
  const storeName = linkedStore?.name || storeNameParam || "선택한 판매처";
  const storeAddress = linkedStore?.address || storeAddressParam || "판매처 주소 정보가 없습니다.";
  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!storeId.trim()) return false;
    if (!requestType) return false;
    if (requestType === "items_changed" && selectedItems.length === 0) return false;
    if (requestType === "address_changed" && !selectedPlace) return false;
    if (requestType === "other" && !note.trim()) return false;
    return true;
  }, [note, requestType, selectedItems.length, selectedPlace, storeId, submitting]);

  const requestSummary = useMemo(() => {
    if (!requestType) {
      return "";
    }
    if (requestType === "items_changed") {
      return `items=${selectedItems.join(",")}`;
    }
    if (requestType === "address_changed") {
      const resolvedAddress = selectedPlace?.roadAddress || selectedPlace?.jibunAddress || address.trim();
      const fullAddress = [resolvedAddress, addressDetail.trim()].filter(Boolean).join(" ").trim();
      return `address=${fullAddress}`;
    }
    if (requestType === "other") {
      return note.trim();
    }
    return requestType;
  }, [address, addressDetail, note, requestType, selectedItems, selectedPlace]);

  useEffect(() => {
    if (requestType !== "address_changed") return;
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
  }, [address, requestType]);

  const toggleItem = (item: FilterType) => {
    setSelectedItems((prev) => (prev.includes(item) ? prev.filter((v) => v !== item) : [...prev, item]));
  };

  const handleSubmit = async () => {
    if (!storeId.trim()) {
      setError("대상 판매처 정보가 없습니다. 상세 페이지에서 다시 시도해주세요.");
      return;
    }
    if (!requestType) {
      setError("수정할 정보를 선택해주세요.");
      return;
    }
    if (requestType === "items_changed" && selectedItems.length === 0) {
      setError("변경된 판매물품을 1개 이상 선택해주세요.");
      return;
    }
    if (requestType === "address_changed" && !selectedPlace) {
      setError("주소 검색 결과에서 변경 주소를 선택해주세요.");
      return;
    }
    if (requestType === "other" && !note.trim()) {
      setError("수정 요청 내용을 입력해주세요.");
      return;
    }

    const client = getBrowserSupabaseClient();
    if (!client) {
      setError("Supabase 환경변수가 설정되지 않았습니다.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const payload = {
      report_type: "edit_request" as const,
      store_id: storeId.trim(),
      name: storeName,
      road_address:
        requestType === "address_changed"
          ? selectedPlace?.roadAddress || selectedPlace?.jibunAddress || address.trim()
          : storeAddress,
      detail_address: requestType === "address_changed" ? addressDetail.trim() : "",
      lat: requestType === "address_changed" ? selectedPlace?.lat ?? null : null,
      lng: requestType === "address_changed" ? selectedPlace?.lng ?? null : null,
      has_trash_bag: selectedItems.includes("PAY_AS_YOU_THROW"),
      has_special_bag: selectedItems.includes("NON_BURNABLE_BAG"),
      has_large_waste_sticker: selectedItems.includes("WASTE_STICKER"),
      message: `[${requestType}] ${requestSummary}`.trim()
    };

    try {
      const { error: insertError } = await client.from("reports").insert(payload);
      setSubmitting(false);
      if (insertError) {
        console.error("[edit request] supabase insert error:", insertError);
        setError(insertError.message || "수정 요청 등록 중 오류가 발생했습니다.");
        return;
      }

      router.push("/edit-request/success");
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : "수정 요청 등록 중 오류가 발생했습니다.");
      return;
    }
  };

  return (
    <main className="mx-auto flex h-screen max-w-md flex-col overflow-hidden bg-white">
      <div className="h-[44px] w-full shrink-0 bg-white" />
      <header className="z-[6] flex h-12 w-full shrink-0 items-center gap-1 overflow-hidden bg-white px-2">
        <div className="size-12 opacity-0" aria-hidden />
        <h1 className="min-w-0 flex-1 text-center text-[16px] font-bold leading-6 text-[#171717]">정보 수정 요청</h1>
        <Link href="/" className="flex size-12 items-center justify-center" aria-label="닫기">
          <img src="/Img/Icon/close_32.svg" alt="" width={32} height={32} className="size-8" />
        </Link>
      </header>
      <section className="min-h-0 flex-1 bg-white pb-2">
        <div className="flex h-full flex-col justify-between gap-6 px-4 py-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
              <h2 className="text-[36px] font-bold leading-6 tracking-[0.1px] text-[#171717] [font-size:20px]">
                수정할 정보를 선택해주세요.
              </h2>
              <div className="rounded-[8px] bg-[#f5f5f5] p-4">
                <p className="text-[16px] font-bold leading-normal tracking-[0.1px] text-[#171717]">{storeName}</p>
                <p className="mt-2 text-[14px] font-normal leading-[1.4] text-[#555555]">{storeAddress}</p>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              {reasons.map((reason) => {
                const active = requestType === reason.key;
                return (
                  <div key={reason.key} className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setRequestType(reason.key)}
                      className={`h-12 w-full rounded-[8px] px-2 py-3 text-center text-[16px] font-bold leading-[1.5] ${
                        active
                          ? "border-2 border-[#171717] bg-[#ecff99] text-[#171717]"
                          : "border border-[#dddddd] bg-white text-[#171717]"
                      }`}
                    >
                      {reason.label}
                    </button>

                    {reason.key === "items_changed" && active ? (
                      <div className="rounded-[8px] bg-[#f5fae1] p-3">
                        <div className="mb-2 flex items-center">
                          <p className="text-[14px] font-bold leading-[1.5] text-[#171717]">판매물품</p>
                          <img src="/Img/Icon/info_24.svg" alt="" width={24} height={24} className="size-6" />
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {itemOrder.map((item) => {
                            const selected = selectedItems.includes(item);
                            return (
                              <button
                                key={item}
                                type="button"
                                onClick={() => toggleItem(item)}
                                className={`h-12 min-w-[157px] rounded-[8px] px-2 py-3 text-[16px] font-bold leading-[1.5] ${
                                  selected
                                    ? "bg-[#171717] text-[#d4fe1c]"
                                    : "border border-[#dddddd] bg-white text-[#171717]"
                                }`}
                              >
                                {item === "NON_BURNABLE_BAG" ? "특수마대" : FILTER_LABELS[item]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {reason.key === "address_changed" && active ? (
                      <div className="rounded-[8px] bg-[#f5fae1] p-3">
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
                              {searchingAddress ? (
                                <p className="px-3 py-2 text-[14px] text-[#555555]">주소 검색 중...</p>
                              ) : null}
                              {addressSearchError ? (
                                <p className="px-3 py-2 text-[14px] text-danger-700">{addressSearchError}</p>
                              ) : null}
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
                                            setSelectedPlace(result);
                                            setAddressResults([]);
                                            setAddressSearchError(null);
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
                    ) : null}

                    {reason.key === "other" && active ? (
                      <div className="rounded-[8px] bg-[#f5fae1] p-3">
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          className="h-[140px] w-full resize-none rounded-[8px] border border-[#dddddd] bg-white px-4 py-4 text-[16px] leading-normal tracking-[-0.3px] text-[#171717] outline-none placeholder:text-[#999999]"
                          placeholder="내용을 입력해주세요."
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {error ? <p className="text-[14px] text-danger-700">{error}</p> : null}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`h-12 w-full rounded-[8px] px-4 py-2 text-center text-[16px] font-bold leading-[1.5] ${
                canSubmit ? "bg-[#171717] text-[#d4fe1c]" : "bg-[#eeeeee] text-[#aaaaaa]"
              }`}
            >
              {submitting ? "제출 중..." : "수정 요청 하기"}
            </button>
          </div>
        </div>
      </section>

      <div className="h-[33px] w-full shrink-0 bg-white pb-[env(safe-area-inset-bottom,0px)]">
        <div className="relative mx-auto h-full w-[135px]">
          <span className="absolute bottom-2 left-1/2 h-[5px] w-[135px] -translate-x-1/2 rounded-[100px] bg-[#222222]" />
        </div>
      </div>
    </main>
  );
}

export default function EditRequestPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto max-w-md bg-bg-canvas p-4 pb-8">
          <p className="text-body-sm text-text-secondary">불러오는 중...</p>
        </main>
      }
    >
      <EditRequestContent />
    </Suspense>
  );
}
