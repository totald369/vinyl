/**
 * Performance probes: set localStorage `debugPerf=1` to log console.time / performance.mark
 * for list load, detail fetch, SDK, markers (cheap no-ops when disabled).
 */
const ENABLED =
  typeof window !== "undefined" &&
  (process.env.NODE_ENV === "development" ||
    (() => {
      try {
        return window.localStorage?.getItem("debugPerf") === "1";
      } catch {
        return false;
      }
    })());

let markSeq = 0;

function safeMark(name: string) {
  if (!ENABLED || typeof performance === "undefined" || !performance.mark) return;
  try {
    performance.mark(`${name}:${++markSeq}`);
  } catch {
    /* ignore */
  }
}

export function perfTimeStart(label: string) {
  if (!ENABLED || typeof console === "undefined" || !console.time) return;
  console.time(label);
}

export function perfTimeEnd(label: string) {
  if (!ENABLED || typeof console === "undefined" || !console.timeEnd) return;
  console.timeEnd(label);
}

export function perfMark(name: string) {
  safeMark(name);
}

export function isPerfDebugEnabled(): boolean {
  return Boolean(ENABLED);
}
