"use client";

import { FILTER_LABELS, FilterType } from "@/lib/types";
import FilterChip from "@/components/ui/FilterChip";

const filterOrder: FilterType[] = [
  "PAY_AS_YOU_THROW",
  "NON_BURNABLE_BAG",
  "WASTE_STICKER"
];

type Props = {
  permission: "unknown" | "granted" | "denied";
  listMode: "defaultRegion" | "myLocation";
  query: string;
  selectedFilters: FilterType[];
  onQueryChange: (query: string) => void;
  onToggleFilter: (filter: FilterType) => void;
  onClickDefaultRegion: () => void;
  onClickMyLocation: () => void;
};

export default function SearchControls({
  permission,
  listMode,
  query,
  selectedFilters,
  onQueryChange,
  onToggleFilter,
  onClickDefaultRegion,
  onClickMyLocation
}: Props) {

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-title-md font-bold tracking-tight text-text-primary">쓰봉맵</p>
        <span className="shrink-0 text-caption text-text-tertiary">종량제·마대·스티커</span>
      </div>
      <div className="flex items-center gap-2 overflow-x-auto">
        <FilterChip label="기본 지역(강남)" active={listMode === "defaultRegion"} onClick={onClickDefaultRegion} />
        <FilterChip label="내 위치" active={listMode === "myLocation"} onClick={onClickMyLocation} />
        <span className="text-caption text-text-tertiary">권한: {permission}</span>
      </div>

      <input
        type="text"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="이름 또는 주소 검색"
        className="w-full rounded-lg border border-border-strong bg-bg-surface px-3 py-2 text-body-sm text-text-primary outline-none placeholder:text-text-disabled focus:border-border-brand"
      />

      <div className="flex gap-2 overflow-x-auto">
        {filterOrder.map((filter) => {
          const active = selectedFilters.includes(filter);
          return (
            <FilterChip key={filter} label={FILTER_LABELS[filter]} active={active} onClick={() => onToggleFilter(filter)} />
          );
        })}
      </div>
    </section>
  );
}
