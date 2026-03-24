"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
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
  const [requestType, setRequestType] = useState<RequestType>("closed");
  const [storeId, setStoreId] = useState(params.get("storeId") ?? "");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [selectedItems, setSelectedItems] = useState<FilterType[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestSummary = useMemo(() => {
    if (requestType === "items_changed") {
      return `items=${selectedItems.join(",")}; note=${note}`;
    }
    if (requestType === "address_changed") {
      return `address=${address}; note=${note}`;
    }
    return note || requestType;
  }, [address, note, requestType, selectedItems]);

  const toggleItem = (item: FilterType) => {
    setSelectedItems((prev) => (prev.includes(item) ? prev.filter((v) => v !== item) : [...prev, item]));
  };

  const handleSubmit = async () => {
    if (!storeId.trim()) {
      setError("대상 매장 ID를 입력해주세요.");
      return;
    }
    if (requestType === "items_changed" && selectedItems.length === 0) {
      setError("변경된 판매물품을 1개 이상 선택해주세요.");
      return;
    }
    if (requestType === "address_changed" && !address.trim()) {
      setError("변경된 주소를 입력해주세요.");
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

    const { error: insertError } = await client.from("store_edit_requests").insert({
      store_id: storeId.trim(),
      request_type: requestType,
      requested_changes: `[${requestType}] ${requestSummary}`
    });
    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/edit-request/success");
  };

  return (
    <main className="mx-auto max-w-md bg-bg-canvas p-4 pb-8">
      <header className="flex items-center gap-3 py-2">
        <Link href="/" className="text-body-sm text-text-secondary">
          뒤로
        </Link>
        <h1 className="text-title-sm text-text-primary">정보 수정 요청</h1>
      </header>
      <section className="mt-4 rounded-2xl border border-border-subtle bg-bg-surface p-4 shadow-elevation-1">
        <p className="text-body-lg font-semibold text-text-primary">수정할 정보를 선택해주세요.</p>
        <input
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="mt-4 w-full rounded-lg border border-border-strong bg-bg-surface px-3 py-2 text-body-sm text-text-primary placeholder:text-text-disabled"
          placeholder="대상 매장 ID"
        />
        <div className="mt-4 space-y-2">
          {reasons.map((reason) => (
            <button
              key={reason.key}
              type="button"
              onClick={() => setRequestType(reason.key)}
              className={`w-full rounded-xl border px-3 py-3 text-left text-body-sm ${
                requestType === reason.key
                  ? "border-brand-500 bg-brand-50 text-text-brand"
                  : "border-border-strong bg-bg-surface text-text-secondary"
              }`}
            >
              {reason.label}
            </button>
          ))}
        </div>

        {requestType === "items_changed" ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
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
        ) : null}

        {requestType === "address_changed" ? (
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="mt-4 w-full rounded-lg border border-border-strong bg-bg-surface px-3 py-2 text-body-sm text-text-primary placeholder:text-text-disabled"
            placeholder="변경된 주소"
          />
        ) : null}

        <form className="mt-4 space-y-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-border-strong bg-bg-surface px-3 py-2 text-body-sm text-text-primary placeholder:text-text-disabled"
            placeholder="수정이 필요한 내용"
            rows={5}
          />
          {error ? <p className="text-body-sm text-danger-700">{error}</p> : null}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="block w-full rounded-xl bg-brand-500 px-4 py-3 text-center text-body-sm font-medium text-text-inverse shadow-elevation-2 disabled:opacity-60"
          >
            {submitting ? "제출 중..." : "수정 요청 하기"}
          </button>
        </form>
      </section>
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
