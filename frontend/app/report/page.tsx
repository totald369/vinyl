"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import LocationPickerMap from "@/components/map/LocationPickerMap";
import { getSupabaseClient } from "@/lib/supabase/client";
import { DEFAULT_REGION, FILTER_LABELS, FilterType, LatLng } from "@/lib/types";

const itemOrder: FilterType[] = ["PAY_AS_YOU_THROW", "NON_BURNABLE_BAG", "WASTE_STICKER"];

export default function ReportPage() {
  const router = useRouter();
  const [location, setLocation] = useState<LatLng>({ lat: DEFAULT_REGION.lat, lng: DEFAULT_REGION.lng });
  const [storeName, setStoreName] = useState("");
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");
  const [note, setNote] = useState("");
  const [selectedItems, setSelectedItems] = useState<FilterType[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fullAddress = useMemo(
    () => (addressDetail.trim() ? `${address} ${addressDetail}`.trim() : address.trim()),
    [address, addressDetail]
  );

  const toggleItem = (item: FilterType) => {
    setSelectedItems((prev) => (prev.includes(item) ? prev.filter((v) => v !== item) : [...prev, item]));
  };

  const handleSubmit = async () => {
    if (!storeName.trim() || !fullAddress.trim()) {
      setError("업체명과 주소를 입력해주세요.");
      return;
    }

    if (selectedItems.length === 0) {
      setError("판매 물품을 1개 이상 선택해주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const client = getSupabaseClient();
    if (!client) {
      setSubmitting(false);
      setError("Supabase 환경변수가 설정되지 않았습니다. .env.local을 확인해주세요.");
      return;
    }

    const { error: insertError } = await client.from("store_reports").insert({
      name: storeName.trim(),
      address: fullAddress,
      lat: location.lat,
      lng: location.lng,
      items: selectedItems,
      note
    });

    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/report/success");
  };

  return (
    <main className="mx-auto max-w-md bg-bg-canvas p-4 pb-8">
      <header className="flex items-center gap-3 py-2">
        <Link href="/" className="text-body-sm text-text-secondary">
          뒤로
        </Link>
        <h1 className="text-title-sm text-text-primary">제보하기</h1>
      </header>

      <section className="mt-4 rounded-2xl border border-border-subtle bg-bg-surface p-4 shadow-elevation-1">
        <p className="text-body-lg font-semibold text-text-primary">새로 등록할 업체를 검색해주세요.</p>
        <p className="mt-1 text-body-sm text-text-tertiary">지도를 움직여서 위치를 지정할 수 있어요.</p>
        <div className="mt-4">
          <LocationPickerMap value={location} onChange={setLocation} />
          <p className="mt-2 text-caption text-text-tertiary">
            선택 좌표: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
          </p>
        </div>
        <form className="mt-4 space-y-3">
          <input
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            className="w-full rounded-lg border border-border-strong bg-bg-surface px-3 py-2 text-body-sm text-text-primary placeholder:text-text-disabled"
            placeholder="업체명을 입력해주세요"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-lg border border-border-strong bg-bg-surface px-3 py-2 text-body-sm text-text-primary placeholder:text-text-disabled"
            placeholder="주소를 입력해주세요"
          />
          <input
            value={addressDetail}
            onChange={(e) => setAddressDetail(e.target.value)}
            className="w-full rounded-lg border border-border-strong bg-bg-surface px-3 py-2 text-body-sm text-text-primary placeholder:text-text-disabled"
            placeholder="상세 주소(선택)"
          />
          <p className="text-body-sm font-medium text-text-primary">판매물품</p>
          <div className="grid grid-cols-3 gap-2">
            {itemOrder.map((item) => {
              const active = selectedItems.includes(item);
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleItem(item)}
                  className={`rounded-xl border px-2 py-3 text-body-sm ${
                    active
                      ? "border-brand-500 bg-brand-500 text-text-inverse"
                      : "border-border-strong bg-bg-surface text-text-secondary"
                  }`}
                >
                  {FILTER_LABELS[item]}
                </button>
              );
            })}
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-border-strong bg-bg-surface px-3 py-2 text-body-sm text-text-primary placeholder:text-text-disabled"
            placeholder="판매 품목/추가 정보"
            rows={4}
          />
          {error ? <p className="text-body-sm text-danger-700">{error}</p> : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="block w-full rounded-xl bg-brand-500 px-4 py-3 text-center text-body-sm font-medium text-text-inverse shadow-elevation-2 disabled:opacity-60"
          >
            {submitting ? "제출 중..." : "제보하기"}
          </button>
        </form>
      </section>
    </main>
  );
}
