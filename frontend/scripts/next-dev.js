/**
 * 1) (선택) production 빌드만 남은 .next 는 제거 — dev 가 요청하는 webpack.js / main-app.js 가 없어 404 나는 경우 방지
 * 2) middleware-manifest 보정
 * 3) 지정 포트(기본 3000)를 점유 중인 LISTEN 프로세스 종료 → 예전에 죽은 next dev에 브라우저가 붙는 500 방지
 * 4) next dev 실행
 *
 * 캐시 유지: NEXT_DEV_KEEP_CACHE=1 npm run dev
 */
const fs = require("fs");
const path = require("path");
const { spawnSync, spawn, execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const port = String(process.env.PORT || "3000");

function nextDirLooksLikeProductionOnly(nextDir) {
  const chunksDir = path.join(nextDir, "static", "chunks");
  if (!fs.existsSync(chunksDir)) return false;
  let names;
  try {
    names = fs.readdirSync(chunksDir);
  } catch {
    return false;
  }
  const hasHashedWebpack = names.some((n) => /^webpack-[a-zA-Z0-9_-]+\.js$/.test(n));
  const hasBareWebpack = names.includes("webpack.js");
  return hasHashedWebpack && !hasBareWebpack;
}

const nextDir = path.join(root, ".next");
if (
  process.env.NEXT_DEV_KEEP_CACHE !== "1" &&
  fs.existsSync(nextDir) &&
  nextDirLooksLikeProductionOnly(nextDir)
) {
  fs.rmSync(nextDir, { recursive: true, force: true });
  console.log(
    "[next-dev] production 빌드(.next)를 지웠습니다. dev 전용 청크와 충돌을 막기 위함입니다."
  );
}

spawnSync(process.execPath, [path.join(__dirname, "ensure-middleware-manifest.js")], {
  cwd: root,
  stdio: "inherit"
});

function freeListeningPort(p) {
  if (process.platform === "win32") return;
  try {
    const out = execFileSync("lsof", [`-tiTCP:${p}`, "-sTCP:LISTEN"], { encoding: "utf8" });
    const pids = [...new Set(out.trim().split("\n").filter(Boolean))];
    for (const s of pids) {
      const pid = Number(s);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* ignore */
      }
    }
    if (pids.length) {
      spawnSync("sleep", ["0.5"], { stdio: "ignore" });
      for (const s of pids) {
        const pid = Number(s);
        if (!Number.isFinite(pid)) continue;
        try {
          process.kill(pid, 0);
          process.kill(pid, "SIGKILL");
        } catch {
          /* already dead */
        }
      }
      console.log(`[next-dev] 포트 ${p} 사용 중이던 프로세스를 종료했습니다: ${pids.join(", ")}`);
    }
  } catch {
    /* lsof 없음 또는 해당 포트 LISTEN 없음 */
  }
}

freeListeningPort(port);

function waitUntilPortFree(p, maxMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      execFileSync("lsof", [`-tiTCP:${p}`, "-sTCP:LISTEN"], { encoding: "utf8" });
      spawnSync("sleep", ["0.15"], { stdio: "ignore" });
    } catch {
      return;
    }
  }
  console.warn(`[next-dev] 경고: ${maxMs}ms 안에 포트 ${p} 가 비지 않았습니다. 그래도 next dev 를 시작합니다.`);
}

waitUntilPortFree(port);

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
if (!fs.existsSync(nextBin)) {
  console.error("[next-dev] Next.js가 설치되어 있지 않습니다. npm install 을 실행하세요.");
  process.exit(1);
}

const child = spawn(process.execPath, [nextBin, "dev", "-p", port], {
  cwd: root,
  stdio: "inherit",
  env: process.env
});

child.on("exit", (code) => process.exit(code ?? 0));
