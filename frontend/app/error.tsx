"use client";

import { useEffect } from "react";

function isChunkLoadError(e: unknown): boolean {
  if (e == null) return false;
  const err = e as Error;
  if (err.name === "ChunkLoadError") return true;
  const msg = typeof err.message === "string" ? err.message : String(e);
  return /Loading chunk \d+ failed/i.test(msg) || /Failed to fetch dynamically imported module/i.test(msg);
}

const RELOAD_FLAG_KEY = "trashbagmap_chunk_reload_at";
const LOOP_GUARD_MS = 5000;

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (!isChunkLoadError(error)) return;
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
  }, [error]);

  return (
    <main className="flex min-h-[50vh] flex-col items-center justify-center gap-4 bg-bg-canvas px-4 py-12">
      <p className="text-center text-body-sm text-text-secondary">
        {"\uC77C\uC2DC\uC801\uC778 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC0C8\uB85C\uACE0\uCE68 \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694."}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          className="rounded-lg bg-[#171717] px-4 py-2.5 text-[15px] font-bold text-[#d4fe1c] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          onClick={() => window.location.reload()}
        >
          {"\uC0C8\uB85C\uACE0\uCE68"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-[#DDDDDD] bg-white px-4 py-2.5 text-[15px] font-bold text-[#171717] outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          onClick={() => reset()}
        >
          {"\uB2E4\uC2DC \uC2DC\uB3C4"}
        </button>
      </div>
    </main>
  );
}
