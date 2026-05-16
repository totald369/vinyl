"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trackRegionEvent } from "@/lib/analytics";
import {
  PROVINCES_ORDERED,
  QUICK_REGION_LINKS,
  type ProvinceDef,
  regionHrefFromSegments,
  resolveRegionLeafFromSlugPath
} from "@/lib/koreaRegions";

/** `QUICK_REGION_LINKS` path 마지막 세그먼트 → `/public/Img/image` 칩. */
const QUICK_REGION_CHIP_IMAGE_BY_SLUG: Partial<Record<string, string>> = {
  gangnam: "/Img/image/chip-gangnam.png",
  dongjak: "/Img/image/chip-dongjak.png",
  gangdong: "/Img/image/chip-gangdong.png",
  gwanak: "/Img/image/chip-kuanak.png",
  mapo: "/Img/image/chip-mapo.png",
  seocho: "/Img/image/chip-seocho.png",
  songpa: "/Img/image/chip-songpha.png",
  yeongdeungpo: "/Img/image/chip-young.png"
};

function applyInitialSelection(
  provinces: ProvinceDef[],
  initialPath: string | null
): {
  provinceSlug: string;
  expandedCitySlug: string | null;
  selectedDistrictKey: string | null;
} | null {
  if (!initialPath?.trim()) return null;
  const segs = initialPath
    .split("/")
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean);
  if (!segs.length) return null;
  const leaf = resolveRegionLeafFromSlugPath(segs);
  if (!leaf) return null;
  const provinceSlug = leaf.provinceSlug;
  const p = provinces.find((x) => x.slug === provinceSlug);
  if (!p) return null;
  if (p.directDistricts?.length) {
    return {
      provinceSlug,
      expandedCitySlug: null,
      selectedDistrictKey: `${provinceSlug}/${leaf.districtSlug ?? ""}`
    };
  }
  if (leaf.citySlug && p.cities) {
    const city = p.cities.find((c) => c.slug === leaf.citySlug);
    if (city?.districts?.length && leaf.districtSlug) {
      return {
        provinceSlug,
        expandedCitySlug: leaf.citySlug,
        selectedDistrictKey: `${provinceSlug}/${leaf.citySlug}/${leaf.districtSlug}`
      };
    }
    if (
      city?.districts?.length &&
      city.legacyCityWideNeedles?.length &&
      leaf.citySlug &&
      !leaf.districtSlug
    ) {
      return {
        provinceSlug,
        expandedCitySlug: leaf.citySlug,
        selectedDistrictKey: `${provinceSlug}/${leaf.citySlug}`
      };
    }
    if (city?.cityOnlyNeedles) {
      return {
        provinceSlug,
        expandedCitySlug: null,
        selectedDistrictKey: `${provinceSlug}/${leaf.citySlug}`
      };
    }
  }
  return { provinceSlug, expandedCitySlug: null, selectedDistrictKey: null };
}

export default function RegionPickerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const trackedRef = useRef(false);

  const [provinceSlug, setProvinceSlug] = useState(PROVINCES_ORDERED[0].slug);
  const [expandedCitySlug, setExpandedCitySlug] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const activeProvince = useMemo(
    () => PROVINCES_ORDERED.find((p) => p.slug === provinceSlug) ?? PROVINCES_ORDERED[0],
    [provinceSlug]
  );

  useEffect(() => {
    const initial = searchParams.get("initial")?.trim() ?? null;
    const sel = applyInitialSelection(PROVINCES_ORDERED, initial);
    if (!sel) return;
    setProvinceSlug(sel.provinceSlug);
    setExpandedCitySlug(sel.expandedCitySlug);
    setSelectedKey(sel.selectedDistrictKey);
  }, [searchParams]);

  useEffect(() => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    trackRegionEvent("open_region_view", { province: "", region_path: "/regions" });
  }, []);

  const trackSelectSegments = useCallback((segments: string[]) => {
    const leaf = resolveRegionLeafFromSlugPath(segments);
    if (!leaf) return;
    trackRegionEvent("select_region", {
      province: leaf.shortNameKo,
      city: leaf.cityNameKo ?? "",
      district: leaf.districtNameKo ?? ""
    });
  }, []);

  const districtRowClass = (isSel: boolean) =>
    `flex h-11 min-h-[44px] w-full items-center pl-8 pr-4 text-left text-[14px] outline-none focus-visible:bg-[#f7f7f7] focus-visible:ring-2 focus-visible:ring-brand-500 ${
      isSel ? "font-semibold text-[#171717]" : "font-medium text-[#171717]"
    }`;

  /**
   * 변경 전: picker 의 region 버튼이 `<button>` + `router.push` 라 prefetch 가 없었음 →
   *          클릭 후에야 RSC payload + JS chunk 다운로드 + SSR 실행이 시작되어 ~수백 ms 빈 화면.
   * 변경 후: onPointerDown 시점에 router.prefetch 로 RSC + chunk 를 미리 받아 캐시.
   *          - PointerDown 은 click 보다 보통 50~150ms 빠르고, 모바일 터치도 동일하게 발화.
   *          - prefetch 는 idempotent (중복 호출 안전), 미사용해도 RSC 캐시는 짧은 TTL 로 자동 정리.
   *          - 사용자 의도 없는 prefetch 폭주 방지: 마지막 prefetch href 만 기록해 중복 호출 차단.
   */
  const lastPrefetchedHrefRef = useRef<string | null>(null);
  const prefetchSegments = useCallback(
    (segments: string[]) => {
      if (!resolveRegionLeafFromSlugPath(segments)) return;
      const href = regionHrefFromSegments(segments);
      if (lastPrefetchedHrefRef.current === href) return;
      lastPrefetchedHrefRef.current = href;
      try {
        router.prefetch(href as Route);
      } catch {
        /* dev 환경 또는 미지원 환경에서 silently 무시 */
      }
    },
    [router]
  );

  return (
    <main className="mx-auto flex max-h-[100dvh] min-h-[100dvh] min-w-0 max-w-md flex-col bg-white">
      <header className="flex shrink-0 items-center px-4 py-2 pt-[calc(8px+env(safe-area-inset-top))]">
        <span className="size-12 shrink-0" aria-hidden />
        <h1 className="min-w-0 flex-1 text-center text-[16px] font-bold leading-[1.5] text-[#171717]">
          지역으로 보기
        </h1>
        <Link
          href="/"
          className="flex size-12 shrink-0 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="닫기"
        >
          <img src="/Img/Icon/close_32.svg" alt="" width={32} height={32} />
        </Link>
      </header>

      <div className="min-w-0 shrink-0 px-4 py-2">
        <div className="flex min-w-0 flex-nowrap gap-[12px] overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {QUICK_REGION_LINKS.map((q) => {
            const slug = q.path.split("/").pop() ?? "";
            const chipSrc = QUICK_REGION_CHIP_IMAGE_BY_SLUG[slug];
            return (
              <Link
                key={q.path}
                href={regionHrefFromSegments(q.path.split("/")) as Route}
                className="relative size-12 shrink-0 overflow-hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                onPointerDown={() => prefetchSegments(q.path.split("/"))}
                onClick={() =>
                  trackRegionEvent("select_region", {
                    province: "서울",
                    district: q.label
                  })
                }
              >
                {chipSrc?.trim() ? (
                  <>
                    {/**
                     * [LCP/CLS] chip-*.png 정적 PNG 는 next/image 로 변환:
                     *  - avif/webp 자동 변환 + 적절한 width/sizes 로 최적 자산 다운로드.
                     *  - 48×48(size-12) 고정 → fill 대신 width/height 명시로 CLS 0.
                     */}
                    <Image
                      src={chipSrc}
                      alt=""
                      width={48}
                      height={48}
                      sizes="48px"
                      className="absolute inset-0 size-full object-cover"
                    />
                    <span
                      className="absolute inset-0 bg-[rgba(23,23,23,0.4)]"
                      aria-hidden
                    />
                  </>
                ) : (
                  <span className="absolute inset-0 bg-[#3d3d3d]" aria-hidden />
                )}
                <span className="relative z-[1] flex size-full items-center justify-center px-1 text-center text-[11px] font-semibold leading-[1.2] tracking-[0.1px] text-white">
                  {q.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 divide-x divide-[#f1f1f1]">
        <nav
          aria-label="시·도"
          className="w-[120px] shrink-0 overflow-y-auto bg-[#f7f7f7] [-ms-overflow-style:none] [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
        >
          {PROVINCES_ORDERED.map((p) => {
            const sel = p.slug === provinceSlug;
            return (
              <button
                key={p.slug}
                type="button"
                onClick={() => {
                  setProvinceSlug(p.slug);
                  setExpandedCitySlug(null);
                  setSelectedKey(null);
                }}
                className={`flex h-12 w-full items-center justify-center px-4 text-[14px] font-semibold tracking-[0.1px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${
                  sel ? "bg-white text-[#171717]" : "bg-transparent text-[#171717]"
                }`}
              >
                {p.shortNameKo}
              </button>
            );
          })}
        </nav>

        <section
          aria-label="시·군·구"
          className="min-w-0 flex-1 overflow-y-auto bg-white"
        >
          {activeProvince.directDistricts?.map((dist) => {
            const segments = [activeProvince.slug, dist.slug];
            const key = `${activeProvince.slug}/${dist.slug}`;
            const isSel = selectedKey === key;
            return (
              <Link
                key={dist.slug}
                href={regionHrefFromSegments(segments) as Route}
                prefetch
                onPointerDown={() => prefetchSegments(segments)}
                onClick={() => {
                  setSelectedKey(key);
                  trackSelectSegments(segments);
                }}
                className={districtRowClass(isSel)}
              >
                <span
                  className={
                    isSel
                      ? "inline-flex items-center gap-0.5 border-b-[8px] border-[#d4fe1c] pb-px"
                      : ""
                  }
                >
                  {dist.nameKo}
                  {isSel ? (
                    <img src="/Img/Icon/check_16.svg" alt="" width={16} height={16} />
                  ) : null}
                </span>
              </Link>
            );
          })}

          {activeProvince.cities?.map((city) => {
            const expandable = !!(city.districts && city.districts.length);
            const expanded = expandedCitySlug === city.slug;

            const citySegments = expandable ? undefined : [activeProvince.slug, city.slug];

            const onCityClick = () => {
              if (expandable) {
                setExpandedCitySlug(expanded ? null : city.slug);
                return;
              }
            };

            const cityOnlyKey = `${activeProvince.slug}/${city.slug}`;

            return (
              <div key={city.slug}>
                {expandable || !citySegments ? (
                  <button
                    type="button"
                    onClick={onCityClick}
                    className="flex h-11 min-h-[44px] w-full items-center gap-2 pl-8 pr-4 outline-none focus-visible:bg-[#f7f7f7] focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <span className="min-w-0 flex-1 text-left text-[14px] tracking-[0.1px] text-[#171717]">
                      {city.nameKo}
                    </span>
                    {expandable ? (
                      <img
                        src={
                          expanded ? "/Img/Icon/chevronUp_24_grey.svg" : "/Img/Icon/chevronDown_24_grey.svg"
                        }
                        alt=""
                        width={24}
                        height={24}
                      />
                    ) : null}
                  </button>
                ) : (
                  <Link
                    href={regionHrefFromSegments(citySegments) as Route}
                    prefetch
                    onPointerDown={() => prefetchSegments(citySegments)}
                    onClick={() => {
                      setSelectedKey(cityOnlyKey);
                      trackSelectSegments(citySegments);
                    }}
                    className="flex h-11 min-h-[44px] w-full items-center gap-2 pl-8 pr-4 outline-none focus-visible:bg-[#f7f7f7] focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <span className="min-w-0 flex-1 text-left text-[14px] tracking-[0.1px] text-[#171717]">
                      {city.nameKo}
                    </span>
                  </Link>
                )}
                {expandable && expanded
                  ? city.districts?.map((dist) => {
                      const segments = [activeProvince.slug, city.slug, dist.slug];
                      const key = `${activeProvince.slug}/${city.slug}/${dist.slug}`;
                      const isSel = selectedKey === key;
                      return (
                        <Link
                          key={dist.slug}
                          href={regionHrefFromSegments(segments) as Route}
                          prefetch
                          onPointerDown={() => prefetchSegments(segments)}
                          onClick={() => {
                            setSelectedKey(key);
                            trackSelectSegments(segments);
                          }}
                          className={`flex h-11 min-h-[44px] w-full items-center pl-10 pr-4 text-left text-[14px] outline-none focus-visible:bg-[#f7f7f7] focus-visible:ring-2 focus-visible:ring-brand-500 ${
                            isSel ? "font-semibold text-[#171717]" : "font-medium text-[#171717]"
                          }`}
                        >
                          <span
                            className={
                              isSel
                                ? "inline-flex items-center gap-0.5 border-b-[8px] border-[#d4fe1c] pb-px"
                                : ""
                            }
                          >
                            {dist.nameKo}
                            {isSel ? (
                              <img src="/Img/Icon/check_16.svg" alt="" width={16} height={16} />
                            ) : null}
                          </span>
                        </Link>
                      );
                    })
                  : null}
              </div>
            );
          })}
        </section>
      </div>
    </main>
  );
}
