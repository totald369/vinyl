"use client";

import { useEffect } from "react";

const RELOAD_FLAG_KEY = "trashbagmap_chunk_reload_at";
/** Same-tab loop guard: ignore chunk errors within this many ms of the last auto-reload. */
const LOOP_GUARD_MS = 5000;

function isChunkLoadError(e: unknown): boolean {
  if (e == null) return false;
  const err = e as Error;
  if (err.name === "ChunkLoadError") return true;
  const msg = typeof err.message === "string" ? err.message : String(e);
  if (/Loading chunk \d+ failed/i.test(msg)) return true;
  if (/Failed to fetch dynamically imported module/i.test(msg)) return true;
  if (/Importing a module script failed/i.test(msg)) return true;
  return false;
}

function scheduleChunkReload(): void {
  try {
    const raw = sessionStorage.getItem(RELOAD_FLAG_KEY);
    const now = Date.now();
    if (raw) {
      const prev = Number(raw);
      if (Number.isFinite(prev) && now - prev < LOOP_GUARD_MS) {
        return;
      }
    }
    sessionStorage.setItem(RELOAD_FLAG_KEY, String(now));
  } catch {
    return;
  }
  window.location.reload();
}

/** Auto-reload once when stale chunk URLs404 (deploy / HMR mismatch). */
export default function ChunkLoadRecovery() {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      if (!isChunkLoadError(event.reason)) return;
      event.preventDefault();
      scheduleChunkReload();
    };

    const onError = (event: Event) => {
      const t = event.target;
      if (!(t instanceof HTMLScriptElement)) return;
      const src = t.src ?? "";
      if (!src.includes("/_next/static/chunks/")) return;
      event.preventDefault();
      scheduleChunkReload();
    };

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError, true);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError, true);
    };
  }, []);

  return null;
}
