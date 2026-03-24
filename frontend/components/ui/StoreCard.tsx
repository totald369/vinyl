import Link from "next/link";
import { FILTER_LABELS, StoreItem } from "@/lib/types";

type Props = {
  store: StoreItem;
  compact?: boolean;
};

export default function StoreCard({ store, compact = false }: Props) {
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
