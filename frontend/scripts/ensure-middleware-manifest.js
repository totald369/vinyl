/**
 * Next dev가 .next/server/middleware-manifest.json 없이(또는 손상되어) 요청을 받으면
 * ENOENT 또는 layout.css / main-app.js 로딩 실패가 날 수 있습니다.
 * dev 시작 전에 최소한의 유효한 JSON이 있도록 합니다.
 *
 * 커스텀 middleware.ts 가 있으면 Next 가 곧바로 덮어쓰는 manifest 와 충돌할 수 있으므로,
 * 이 프로젝트에서는 통과 전용 미들웨어를 두지 않습니다(필요 시 Next 기본 파이프라인만 사용).
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
