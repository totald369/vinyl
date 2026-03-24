"use client";

import Link from "next/link";
import { ContentState, StoreItem } from "@/lib/types";
import StoreCard from "@/components/ui/StoreCard";

type Props = {
  contentState: ContentState;
  stores: StoreItem[];
  errorMessage?: string;
};

export default function StoreList({ contentState, stores, errorMessage }: Props) {

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
      <ul className="space-y-3">
        {stores.map((store) => (
          <li key={store.id}>
            <StoreCard store={store} />
          </li>
        ))}
      </ul>
    </section>
  );
}
