/**
 * 1) middleware-manifest 보정
 * 2) 지정 포트(기본 3000)를 점유 중인 LISTEN 프로세스 종료 → 예전에 죽은 next dev에 브라우저가 붙는 500 방지
 * 3) next dev 실행
 */
const fs = require("fs");
const path = require("path");
const { spawnSync, spawn, execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const port = String(process.env.PORT || "3000");

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
