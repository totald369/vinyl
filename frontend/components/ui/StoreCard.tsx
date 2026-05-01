import Link from "next/link";
import { memo } from "react";
import { FILTER_LABELS, StoreItem } from "@/lib/types";

type Props = {
  store: StoreItem;
  compact?: boolean;
};

/**
 * 변경 전: 목록 스크롤 시 카드 전량 리렌더.
 * 변경 후: id·거리 중심 동등 비교로 가상 스크롤과 결합 시 불필요한 commit 감소.
 */
function StoreCardInner({ store, compact = false }: Props) {
  return (
    <article className="rounded-xl border border-border-subtle bg-bg-surface p-4 shadow-elevation-1">
      <Link href={`/stores/${store.id}`} className="block">
        <h3 className="text-body-lg font-semibold text-text-primary">{store.name}</h3>
        <p className="mt-1 text-body-sm text-text-secondary">{store.address}</p>
        <p className="mt-1 text-body-sm text-text-tertiary">{store.distanceKm?.toFixed(1)}km</p>
        {!compact ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {store.products.map((item) => (
              <span key={item} className="rounded-full bg-bg-muted px-2 py-1 text-caption text-text-secondary">
                {FILTER_LABELS[item]}
              </span>
            ))}
          </div>
        ) : null}
      </Link>
    </article>
  );
}

const StoreCard = memo(
  StoreCardInner,
  (prev, next) =>
    prev.store.id === next.store.id &&
    prev.compact === next.compact &&
    prev.store.address === next.store.address &&
    prev.store.name === next.store.name &&
    prev.store.distanceKm === next.store.distanceKm &&
    prev.store.products.length === next.store.products.length &&
    prev.store.products.every((p, i) => p === next.store.products[i])
);

export default StoreCard;
