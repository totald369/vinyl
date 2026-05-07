#!/usr/bin/env python3
"""
대전광역시 동구 종량제봉투 판매소 CSV -> stores.daejeon-donggu-trash.json

입력 컬럼:
- 연번, 판매소명, 판매소주소
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

DOWNLOAD_CSV = (
    Path.home()
    / "Downloads"
    / "대전광역시 동구_종량제봉투판매소 현황_20250718.csv"
)
FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.daejeon-donggu-trash.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-daejeon-donggu-trash.json"
SHORT_CODE_RE = re.compile(r"^[a-zA-Z0-9]{6}$")
GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"


def load_kakao_key() -> str | None:
    k = os.environ.get("KAKAO_REST_API_KEY", "").strip()
    if k:
        return k
    p = FRONTEND / ".env.local"
    if not p.exists():
        return None
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("KAKAO_REST_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'") or None
    return None


def decode_csv(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp949", "euc-kr", "utf-8"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("cp949", errors="replace")


def normalize_addr(addr: str) -> str:
    a = " ".join((addr or "").replace("\xa0", " ").split())
    if not a:
        return a
    if a.startswith("대전광역시 동구"):
        return a
    if a.startswith("동구") and not a.startswith("대전"):
        return f"대전광역시 {a}"
    if a.startswith("대전 동구"):
        return "대전광역시 " + a[len("대전") :].strip()
    return f"대전광역시 동구 {a}"


def addr_variants(addr: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()

    def add(v: str) -> None:
        t = " ".join((v or "").split())
        if t and t not in seen:
            seen.add(t)
            out.append(t)

    add(addr)
    head = re.sub(r"\(.*?\)", "", addr).strip()
    add(head)
    add(re.sub(r"(\d+길)(\d+)$", r"\1 \2", head).strip())
    add(re.sub(r"([가-힣]+로)(\d)", r"\1 \2", head).strip())
    return out


def parse_float(v: str | None) -> float | None:
    try:
        return float((v or "").strip())
    except ValueError:
        return None


def kakao_geocode(q: str, key: str) -> tuple[float | None, float | None]:
    for base, extra in (
        (GEOCODE_URL, {"query": q}),
        (KEYWORD_URL, {"query": q, "size": "1"}),
    ):
        req = urllib.request.Request(
            f"{base}?{urllib.parse.urlencode(extra)}",
            headers={"Authorization": f"KakaoAK {key}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception:
            continue
        docs = data.get("documents") or []
        if not docs:
            continue
        lat = parse_float(docs[0].get("y"))
        lng = parse_float(docs[0].get("x"))
        if lat and lng:
            return lat, lng
    return None, None


def load_cache() -> dict[str, list[float]]:
    if not CACHE_PATH.exists():
        return {}
    try:
        raw = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    out: dict[str, list[float]] = {}
    if isinstance(raw, dict):
        for k, v in raw.items():
            if isinstance(v, list) and len(v) == 2:
                out[str(k)] = [float(v[0]), float(v[1])]
    return out


def save_cache(cache: dict[str, list[float]]) -> None:
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8")


def load_existing_meta(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    out: dict[str, dict[str, str]] = {}
    if not isinstance(rows, list):
        return out
    for row in rows:
        if not isinstance(row, dict) or not row.get("id"):
            continue
        rid = str(row["id"])
        meta: dict[str, str] = {}
        sc = row.get("shortCode")
        if isinstance(sc, str) and SHORT_CODE_RE.match(sc.strip()):
            meta["shortCode"] = sc.strip()
        dr = row.get("dataReferenceDate")
        if isinstance(dr, str) and dr.strip():
            meta["dataReferenceDate"] = dr.strip()
        if meta:
            out[rid] = meta
    return out


def in_daejeon_donggu_bbox(lat: float, lng: float) -> bool:
    # 대전 동구 일대 (넉넉히)
    return 36.25 <= lat <= 36.50 and 127.30 <= lng <= 127.60


def main() -> None:
    if not DOWNLOAD_CSV.exists():
        raise SystemExit(f"CSV 없음: {DOWNLOAD_CSV}")
    key = load_kakao_key()
    if not key:
        raise SystemExit("KAKAO_REST_API_KEY 필요")

    text = decode_csv(DOWNLOAD_CSV.read_bytes())
    reader = csv.DictReader(text.splitlines())

    dedup: dict[str, dict] = {}
    for r in reader:
        name = (r.get("판매소명 ") or r.get("판매소명") or "").strip()
        raw_addr = (r.get("판매소주소") or "").strip()
        addr = normalize_addr(raw_addr)
        if not name or not addr:
            continue
        k = f"{name.lower()}|{addr.lower()}"
        if k not in dedup:
            dedup[k] = {"name": " ".join(name.split()), "roadAddress": addr}

    rows = sorted(dedup.values(), key=lambda x: (x["name"], x["roadAddress"]))
    cache = load_cache()
    existing_meta = load_existing_meta(OUT_JSON)
    ref = "2025-07-18"
    today = date.today().isoformat()

    out: list[dict] = []
    for i, r in enumerate(rows, start=1):
        sid = f"daejeon-donggu-trash-{i:04d}"
        ck = hashlib.sha1((r["name"] + "\t" + r["roadAddress"]).encode("utf-8")).hexdigest()[:20]
        if ck in cache:
            lat, lng = cache[ck]
        else:
            lat = lng = None
            for base in addr_variants(r["roadAddress"]):
                for q in (
                    base,
                    f"{r['name']} {base}",
                    f"대전광역시 동구 {r['name']}",
                    f"대전 동구 {r['name']}",
                ):
                    glat, glng = kakao_geocode(q, key)
                    if glat is not None and glng is not None:
                        lat, lng = glat, glng
                        break
                if lat is not None and lng is not None:
                    break
            if lat is None or lng is None:
                continue
            if not in_daejeon_donggu_bbox(lat, lng):
                continue
            cache[ck] = [lat, lng]
            if i % 40 == 0:
                save_cache(cache)
            time.sleep(0.08)

        if not in_daejeon_donggu_bbox(float(lat), float(lng)):  # type: ignore[arg-type]
            continue

        rec = {
            "id": sid,
            "name": r["name"],
            "lat": round(float(lat), 7),
            "lng": round(float(lng), 7),
            "roadAddress": r["roadAddress"],
            "address": "대전광역시 동구",
            "businessStatus": "영업",
            "hasTrashBag": True,
            "hasSpecialBag": False,
            "hasLargeWasteSticker": False,
            "adminVerified": True,
            "dataReferenceDate": existing_meta.get(sid, {}).get("dataReferenceDate", ref or today),
        }
        sc = existing_meta.get(sid, {}).get("shortCode")
        if sc:
            rec["shortCode"] = sc
        out.append(rec)

    save_cache(cache)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(out)} rows -> {OUT_JSON}")


if __name__ == "__main__":
    main()
