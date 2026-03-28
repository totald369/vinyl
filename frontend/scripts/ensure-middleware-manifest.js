/**
 * Next dev가 기존 .next 캐시를 쓸 때 middleware-manifest.json 이 없거나 손상되면
 * 요청 처리가 꼬일 수 있어, 최소한의 유효한 JSON으로 보정합니다.
 *
 * 주의: .next 를 비운 직후(폴더 없음)에는 next-dev.js 가 이 스크립트를 호출하지 않습니다.
 * 그 상태에서 manifest 만 만들면 정적 청크(layout.css, main-app.js) 404 가 날 수 있습니다.
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
