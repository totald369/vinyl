"use client";

/**
 * `/ ?s=`·`/s/` 단축 링크 역참조, 세션 폴백, 중복 fetch 방지.
 *
 * 변경 전: HomeClient 400+ 줄에 섞여 리뷰·테스트 어렵고 실수 시 무한 재요청 위험.
 * 변경 후: 부수효과·ref 단명을 한 훅에 모아 홈 JSX는 레이아웃·핸들러만 유지.
 * 측정: 디링크 진입부터 상세 패널 오픈까지(ms), `/api/stores?short=` 중복 호출 수.
 */
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type React from "react";
import type { StoreData } from "@/hooks/useStores";
import {
  DEEPLINK_LOG_PREFIX,
  fetchStoreByShortCodeOnly
} from "@/lib/deepLinkShortResolve";
import { DEEPLINK_SHORT_STORAGE_KEY, isValidShortCode } from "@/lib/shortLink";

type Options = {
  router: Pick<AppRouterInstance, "replace">;
  searchParams: ReadonlyURLSearchParams;
  initialShortCode?: string | null;
  loading: boolean;
  selectedStore: StoreData | null;
  sheetView: "list" | "detail";
  setSheetView: (v: "list" | "detail") => void;
  storesRef: React.RefObject<StoreData[]>;
  /** 매 렌더마다 현재 패닝 콜백을 바인딩(훅이 핸들러보다 위에 호출 가능하도록 ref 사용). */
  handlePanRef: React.MutableRefObject<(store: StoreData, fromShortLink?: boolean) => void>;
};

export function useDeepLinkResolver({
  router,
  searchParams,
  initialShortCode = null,
  loading,
  selectedStore,
  sheetView,
  setSheetView,
  storesRef,
  handlePanRef
}: Options) {
  const sFromSearchParams = searchParams.get("s")?.trim() ?? "";
  const shortLinkFetchForRef = useRef<string | null>(null);
  const lastSeenDeepLinkShortRef = useRef<string>("");
  const [deepLinkResolveError, setDeepLinkResolveError] = useState<string | null>(null);

  const [deepLinkShort, setDeepLinkShort] = useState(() => {
    const p = initialShortCode?.trim() ?? "";
    return isValidShortCode(p) ? p : "";
  });

  useLayoutEffect(() => {
    let code = sFromSearchParams;
    if (!isValidShortCode(code)) {
      const fromUrl =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("s")?.trim() ?? ""
          : "";
      if (isValidShortCode(fromUrl)) code = fromUrl;
    }
    if (!isValidShortCode(code)) {
      const fromProp = initialShortCode?.trim() ?? "";
      if (isValidShortCode(fromProp)) code = fromProp;
    }
    if (!isValidShortCode(code)) {
      try {
        const st = sessionStorage.getItem(DEEPLINK_SHORT_STORAGE_KEY)?.trim() ?? "";
        if (isValidShortCode(st)) code = st;
      } catch {
        /* private mode */
      }
    }
    if (!isValidShortCode(code)) {
      setDeepLinkShort("");
      return;
    }
    setDeepLinkShort(code);

    const onShareShortPath =
      typeof window !== "undefined" && /^\/s\/[a-zA-Z0-9]{6}$/.test(window.location.pathname);

    if (sFromSearchParams !== code && !onShareShortPath) {
      router.replace(`/?s=${encodeURIComponent(code)}`, { scroll: false });
    }
  }, [sFromSearchParams, router, initialShortCode]);

  const dismissDeepLinkError = useCallback(() => {
    setDeepLinkResolveError(null);
    const s = searchParams.get("s")?.trim() ?? "";
    if (isValidShortCode(s)) {
      try {
        sessionStorage.removeItem(DEEPLINK_SHORT_STORAGE_KEY);
      } catch {
        /* noop */
      }
      router.replace("/", { scroll: false });
    }
  }, [router, searchParams]);

  useEffect(() => {
    if (!isValidShortCode(deepLinkShort)) {
      lastSeenDeepLinkShortRef.current = "";
      setDeepLinkResolveError(null);
      return;
    }
    if (loading) return;

    console.info(DEEPLINK_LOG_PREFIX, "effect", {
      deepLinkShort,
      loading,
      selectedShort: selectedStore?.shortCode ?? null,
      sheetView
    });

    const shortParamChanged = lastSeenDeepLinkShortRef.current !== deepLinkShort;
    lastSeenDeepLinkShortRef.current = deepLinkShort;

    const clearDeepLinkStorage = () => {
      try {
        sessionStorage.removeItem(DEEPLINK_SHORT_STORAGE_KEY);
      } catch {
        /* noop */
      }
    };

    if (selectedStore?.shortCode === deepLinkShort) {
      setDeepLinkResolveError(null);
      if (sheetView === "detail") return;
      if (shortParamChanged) {
        console.info(DEEPLINK_LOG_PREFIX, "reopen detail (same store, param changed)");
        setSheetView("detail");
      }
      return;
    }

    if (
      !shortParamChanged &&
      selectedStore != null &&
      isValidShortCode(selectedStore.shortCode) &&
      selectedStore.shortCode !== deepLinkShort
    ) {
      console.info(DEEPLINK_LOG_PREFIX, "skip: user selected different store, stale ?s=");
      return;
    }

    const list = storesRef.current ?? [];
    const fromList = list.find((s) => s.shortCode === deepLinkShort);
    console.info(DEEPLINK_LOG_PREFIX, "fromList", { found: Boolean(fromList), listLen: list.length });

    if (fromList) {
      shortLinkFetchForRef.current = null;
      setDeepLinkResolveError(null);
      handlePanRef.current({ ...fromList, shortCode: deepLinkShort }, true);
      clearDeepLinkStorage();
      return;
    }

    const code = deepLinkShort;
    if (shortLinkFetchForRef.current === code) {
      console.info(DEEPLINK_LOG_PREFIX, "skip fetch: already in flight", code);
      return;
    }
    shortLinkFetchForRef.current = code;

    void (async () => {
      try {
        const { row, requestUrl, httpOk, httpStatus } = await fetchStoreByShortCodeOnly(code);
        if (shortLinkFetchForRef.current !== code) {
          console.info(DEEPLINK_LOG_PREFIX, "stale response ignored", { code });
          return;
        }
        if (!httpOk) {
          console.error(DEEPLINK_LOG_PREFIX, "fallback: API failed", { code, requestUrl, httpStatus });
          setDeepLinkResolveError(
            "\uC5C5\uCCB4 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694."
          );
          clearDeepLinkStorage();
          return;
        }
        if (row) {
          setDeepLinkResolveError(null);
          handlePanRef.current({ ...row, shortCode: code }, true);
          clearDeepLinkStorage();
          console.info(DEEPLINK_LOG_PREFIX, "resolved via API", { code, id: row.id });
          return;
        }
        console.error(DEEPLINK_LOG_PREFIX, "fallback: empty stores[] for shortCode", {
          code,
          requestUrl
        });
        setDeepLinkResolveError(
          "\uD574\uB2F9 \uC5C5\uCCB4\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."
        );
        clearDeepLinkStorage();
      } catch (e) {
        console.error(DEEPLINK_LOG_PREFIX, "unexpected error", e);
        setDeepLinkResolveError(
          "\uC5C5\uCCB4 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."
        );
        clearDeepLinkStorage();
      } finally {
        if (shortLinkFetchForRef.current === code) {
          shortLinkFetchForRef.current = null;
        }
      }
    })();
  }, [
    deepLinkShort,
    loading,
    selectedStore?.shortCode,
    sheetView,
    handlePanRef,
    setSheetView,
    storesRef
  ]);

  useEffect(() => {
    const tryReopenFromUrl = () => {
      if (typeof window === "undefined") return;
      const raw = new URLSearchParams(window.location.search).get("s")?.trim() ?? "";
      if (!isValidShortCode(raw)) return;
      if (sheetView !== "list") return;
      const sel = selectedStore;
      if (!sel || sel.shortCode !== raw) return;
      setSheetView("detail");
    };

    const onVis = () => {
      if (document.visibilityState === "visible") tryReopenFromUrl();
    };
    window.addEventListener("pageshow", tryReopenFromUrl);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pageshow", tryReopenFromUrl);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [selectedStore, sheetView, setSheetView]);

  return { deepLinkResolveError, dismissDeepLinkError };
}
