#!/usr/bin/env python3
"""
인천 미추홀구 종량제봉투 판매소 CSV -> public/data/stores.incheon-michuhol-trash.json

입력 컬럼(예):
- 판매소명, 대표자명, 사업장 주소, 지정일자

규칙:
- 본 데이터는 일반 종량제봉투 판매처로 간주
  -> hasTrashBag=True, hasSpecialBag=False, hasLargeWasteSticker=False
- 주소가 "미추홀구 ..." 형식이면 "인천광역시 미추홀구 ..."로 정규화
- 카카오 주소/키워드 검색으로 좌표 획득
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
    / "인천광역시 미추홀구_쓰레기종량제봉투 판매소 현황_20241213.csv"
)
FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.incheon-michuhol-trash.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-michuhol-trash.json"
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


def normalize_addr(addr: str) -> str:
    a = " ".join((addr or "").replace("\xa0", " ").split())
    if not a:
        return a
    if a.startswith("인천광역시 미추홀구"):
        return a
    if a.startswith("인천 미추홀구"):
        return "인천광역시 미추홀구 " + a[8:].strip()
    if a.startswith("미추홀구"):
        return "인천광역시 " + a
    if a.startswith("인천광역시"):
        return a
    return f"인천광역시 미추홀구 {a}"


def road_variants(road: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()

    def add(v: str) -> None:
        t = " ".join(v.replace("\xa0", " ").split())
        if t and t not in seen:
            seen.add(t)
            out.append(t)

    add(road)
    head = road.split(",")[0].strip()
    add(head)
    add(re.sub(r"\(.*?\)", "", head).strip())
    add(re.sub(r"\s+\d+층\s*$", "", head).strip())
    add(re.sub(r"\s+\d+호\s*$", "", head).strip())
    add(re.sub(r"([가-힣]+로)(\d)", r"\1 \2", head).strip())
    add(re.sub(r"(\d+길)(\d+)$", r"\1 \2", head).strip())
    return out


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


def kakao_geocode(query: str, key: str) -> tuple[float | None, float | None]:
    for base, extra in (
        (GEOCODE_URL, {"query": query}),
        (KEYWORD_URL, {"query": query, "size": "1"}),
    ):
        qs = urllib.parse.urlencode(extra)
        req = urllib.request.Request(
            f"{base}?{qs}", headers={"Authorization": f"KakaoAK {key}"}
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception:
            continue
        docs = data.get("documents") or []
        if not docs:
            continue
        try:
            lat = float(docs[0].get("y"))
            lng = float(docs[0].get("x"))
        except Exception:
            continue
        if lat and lng:
            return lat, lng
    return None, None


def read_csv_rows(path: Path) -> list[dict]:
    raw = path.read_bytes()
    text = None
    for enc in ("utf-8-sig", "cp949", "euc-kr", "utf-8"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        # 일부 관공서 CSV는 CP949 기준으로 일부 바이트만 깨져 있어 replace가 가장 실용적
        text = raw.decode("cp949", errors="replace")
    rows: list[dict] = []
    reader = csv.DictReader(text.splitlines())
    for r in reader:
        name = (r.get("판매소명 ") or r.get("판매소명") or "").strip()
        addr = (r.get("사업장 주소") or "").strip()
        designated = (r.get("지정일자") or "").strip()
        if not name or not addr:
            continue
        rows.append(
            {
                "name": re.sub(r"\s+", " ", name),
                "roadAddress": normalize_addr(addr),
                "dataReferenceDate": designated if re.match(r"^\d{4}-\d{2}-\d{2}$", designated) else None,
            }
        )
    return rows


def load_existing_meta(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    out: dict[str, dict[str, str]] = {}
    if not isinstance(data, list):
        return out
    for row in data:
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


def main() -> None:
    if not DOWNLOAD_CSV.exists():
        raise SystemExit(f"CSV 없음: {DOWNLOAD_CSV}")
    kakao_key = load_kakao_key()
    if not kakao_key:
        raise SystemExit("KAKAO_REST_API_KEY 필요 (.env.local 또는 환경변수)")

    parsed = read_csv_rows(DOWNLOAD_CSV)
    dedup: dict[str, dict] = {}
    for p in parsed:
        k = f"{p['name'].lower()}|{p['roadAddress'].lower()}"
        if k not in dedup:
            dedup[k] = p
        else:
            old = dedup[k].get("dataReferenceDate") or ""
            new = p.get("dataReferenceDate") or ""
            if new and (not old or new > old):
                dedup[k]["dataReferenceDate"] = new
    unique = list(dedup.values())

    cache = load_cache()
    existing_meta = load_existing_meta(OUT_JSON)
    fallback_ref = date.today().isoformat()
    out: list[dict] = []

    for i, row in enumerate(unique, start=1):
        sid = f"michuhol-trash-{i:04d}"
        ck = hashlib.sha1((row["name"] + "\t" + row["roadAddress"]).encode("utf-8")).hexdigest()[:20]
        if ck in cache:
            lat, lng = cache[ck]
        else:
            lat = lng = None
            for base in road_variants(row["roadAddress"]):
                for q in (base, f"{row['name']} {base}", f"인천 미추홀구 {row['name']}"):
                    glat, glng = kakao_geocode(q, kakao_key)
                    if glat is not None and glng is not None:
                        lat, lng = glat, glng
                        break
                if lat is not None and lng is not None:
                    break
            if lat is None or lng is None:
                continue
            cache[ck] = [lat, lng]
            if i % 30 == 0:
                save_cache(cache)
            time.sleep(0.08)

        rec = {
            "id": sid,
            "name": row["name"],
            "lat": round(float(lat), 7),
            "lng": round(float(lng), 7),
            "roadAddress": row["roadAddress"],
            "address": "인천광역시 미추홀구",
            "businessStatus": "영업",
            "hasTrashBag": True,
            "hasSpecialBag": False,
            "hasLargeWasteSticker": False,
            "adminVerified": True,
            "dataReferenceDate": existing_meta.get(sid, {}).get(
                "dataReferenceDate", row.get("dataReferenceDate") or fallback_ref
            ),
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
