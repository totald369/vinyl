"use client";

/**
 * /stores 정적 목록.
 * 변경 후: 가상 스크롤로 수백 행도 DOM 노드 수 상한 유지.
 */
import Link from "next/link";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import StoreCard from "@/components/ui/StoreCard";
import { ContentState, StoreItem } from "@/lib/types";

type Props = {
  contentState: ContentState;
  stores: StoreItem[];
  errorMessage?: string;
};

const EST_STORE_CARD = 180;

export default function StoreList({ contentState, stores, errorMessage }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const rowVirtualizer = useVirtualizer({
    count: stores.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => EST_STORE_CARD,
    overscan: 5
  });

  if (contentState === "loading") {
    return <section className="card text-body-sm text-text-secondary">데이터를 불러오는 중입니다...</section>;
  }

  if (contentState === "error") {
    return (
      <section className="card text-body-sm text-danger-700">
        오류가 발생했습니다: {errorMessage ?? "알 수 없는 오류"}
      </section>
    );
  }

  if (contentState === "empty") {
    return (
      <section className="card text-center">
        <p className="text-body-lg font-semibold text-text-primary">등록된 판매처가 없습니다.</p>
        <p className="mt-1 text-body-sm text-text-secondary">판매처를 제보해주시면 2~3일 내 업데이트됩니다.</p>
        <Link href="/report" className="mt-4 inline-block rounded-xl bg-brand-500 px-4 py-2 text-body-sm text-text-inverse">
          제보하기
        </Link>
      </section>
    );
  }

  return (
    <section className="card">
      <h2 className="mb-3 text-title-sm text-text-primary">매장 목록</h2>
      <div
        ref={scrollRef}
        className="max-h-[min(70vh,720px)] overflow-y-auto overscroll-y-contain pr-1"
        role="list"
        aria-label="매장 목록"
      >
        <div className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map((vi) => {
            const store = stores[vi.index];
            return (
              <div
                key={vi.key}
                className="absolute left-0 top-0 w-full pb-3"
                style={{ transform: `translateY(${vi.start}px)` }}
              >
                <StoreCard store={store} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
