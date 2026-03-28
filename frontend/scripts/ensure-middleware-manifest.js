/**
 * Next dev가 .next/server/middleware-manifest.json 없이(또는 손상되어) 요청을 받으면
 * layout.css / main-app.js 등이 500으로 떨어질 수 있습니다.
 * dev 시작 전에 최소한의 유효한 manifest를 보장합니다.
 */
const fs = require("fs");
const path = require("path");

const manifestPath = path.join(__dirname, "..", ".next", "server", "middleware-manifest.json");
const minimal = {
  version: 3,
  middleware: {},
  functions: {},
  sortedMiddleware: []
};

function isValidManifest(raw) {
  if (!raw || typeof raw !== "object") return false;
  return (
    raw.version === 3 &&
    typeof raw.middleware === "object" &&
    typeof raw.functions === "object" &&
    Array.isArray(raw.sortedMiddleware)
  );
}

function readJsonIfOk() {
  try {
    const s = fs.readFileSync(manifestPath, "utf8");
    if (!s.trim()) return null;
    const j = JSON.parse(s);
    return isValidManifest(j) ? j : null;
  } catch {
    return null;
  }
}

try {
  const existing = readJsonIfOk();
  if (existing) return;

  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(minimal));
} catch (e) {
  console.warn("[ensure-middleware-manifest]", e instanceof Error ? e.message : e);
}
