"use client";

import { useEffect } from "react";

/**
 * LCP 이후 카카오 타일 Service Worker 등록 — 첫 방문 네트워크 경합 최소화.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => reg.update())
        .catch(() => {
          /* 등록 실패 시 무시 */
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, []);

  return null;
}
