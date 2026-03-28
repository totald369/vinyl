#!/usr/bin/env python3
"""
서울시 마포구 쓰레기(종량제)봉투 판매업 인허가 JSON → stores.sample.json 병합.
- 영업만: sals_stts_cd 가 '01' 인 행만 (폐업·휴업·취소 등 제외)
- 좌표 xcrd/ycrd 는 위경도가 아니므로 사용하지 않고, 도로명(또는 지번) 주소로 카카오 지오코딩

사용:
  .env.local 의 KAKAO_REST_API_KEY
  python3 scripts/import_mapo_json.py
  python3 scripts/import_mapo_json.py /path/to/....json
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DOWNLOADS = Path.home() / "Downloads"
FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.sample.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-mapo.json"


def _load_dotenv_local():
    p = FRONTEND / ".env.local"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


_load_dotenv_local()
KAKAO_REST_KEY = (
    os.environ.get("KAKAO_REST_KEY", "").strip()
    or os.environ.get("KAKAO_REST_API_KEY", "").strip()
)
GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
GEOCODE_DELAY = 0.06


def to_float(val):
    if val is None:
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (ValueError, TypeError):
        return None


def load_cache():
    if CACHE_PATH.exists():
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(c):
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(c, f, ensure_ascii=False)


def kakao_keyword_geocode(query: str, cache: dict, key: str) -> tuple[float, float] | None:
    h = hashlib.sha256(("kw:" + query).encode("utf-8")).hexdigest()[:16]
    if h in cache:
        lat, lng = cache[h]
        return float(lat), float(lng)
    q2 = urllib.parse.urlencode({"query": query, "size": "1"})
    r = urllib.request.Request(
        f"{KEYWORD_URL}?{q2}", headers={"Authorization": f"KakaoAK {key}"}
    )
    try:
        with urllib.request.urlopen(r, timeout=8) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            docs = data.get("documents", [])
            if docs:
                lat = to_float(docs[0].get("y"))
                lng = to_float(docs[0].get("x"))
                if lat and lng:
                    cache[h] = [lat, lng]
                    time.sleep(GEOCODE_DELAY)
                    return lat, lng
    except (urllib.error.URLError, urllib.error.HTTPError, Exception):
        pass
    time.sleep(GEOCODE_DELAY)
    return None


def kakao_geocode(address: str, cache: dict, key: str) -> tuple[float, float] | None:
    h = hashlib.sha256(address.encode("utf-8")).hexdigest()[:16]
    if h in cache:
        lat, lng = cache[h]
        return float(lat), float(lng)

    def req(url: str) -> tuple[float, float] | None:
        r = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {key}"})
        try:
            with urllib.request.urlopen(r, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                docs = data.get("documents", [])
                if docs:
                    lat = to_float(docs[0].get("y"))
                    lng = to_float(docs[0].get("x"))
                    if lat and lng:
                        return lat, lng
        except (urllib.error.URLError, urllib.error.HTTPError, Exception):
            pass
        return None

    q = urllib.parse.urlencode({"query": address})
    coords = req(f"{GEOCODE_URL}?{q}")
    if not coords:
        q2 = urllib.parse.urlencode({"query": address, "size": "1"})
        coords = req(f"{KEYWORD_URL}?{q2}")
    if coords:
        cache[h] = list(coords)
        time.sleep(GEOCODE_DELAY)
        return coords
    time.sleep(GEOCODE_DELAY)
    return None


def norm_store_name(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    a = re.sub(r"\s+", " ", addr.strip().lower())
    return f"{norm_store_name(name).lower()}|{a}"


def geocode_query_variants(full_addr: str) -> list[str]:
    seen: list[str] = []
    for q in (full_addr, re.sub(r"\s+", " ", full_addr).strip()):
        if q and q not in seen:
            seen.append(q)
    base = full_addr
    # 신촌로30길 → 신촌로 30길
    spaced_alley = re.sub(r"([가-힣]+로)(\d+)(길)", r"\1 \2\3", base)
    if spaced_alley != base and spaced_alley not in seen:
        seen.append(spaced_alley)
        base = spaced_alley
    if "," in base:
        head = base.split(",")[0].strip()
        if head and head not in seen:
            seen.append(head)
    # 월드컵북로 48-30 → 번지 접미 제거 시도
    m = re.search(r"([가-힣]+(?:로|길))\s+(\d+)-(\d+)", base)
    if m:
        stripped = base.replace(m.group(0), f"{m.group(1)} {m.group(2)}", 1)
        if stripped not in seen:
            seen.append(stripped)
        if "," in stripped:
            h = stripped.split(",")[0].strip()
            if h not in seen:
                seen.append(h)
    m = re.search(r"(면로|대로|로|길)(\d{2,4})\b", base)
    if m:
        fixed = re.sub(
            r"(면로|대로|로|길)(\d{2,4})\b",
            lambda mm: f"{mm.group(1)} {mm.group(2)}",
            base,
            count=1,
        )
        if fixed not in seen:
            seen.append(fixed)
        if "," in fixed:
            h2 = fixed.split(",")[0].strip()
            if h2 not in seen:
                seen.append(h2)
    return seen


def resolve_coords(
    road_address: str,
    place_name: str,
    cache: dict,
    key: str,
    extra_queries: list[str] | None = None,
) -> tuple[float, float] | None:
    queries = [road_address]
    if extra_queries:
        for eq in extra_queries:
            eq = re.sub(r"\s+", " ", (eq or "").strip())
            if eq and eq not in queries:
                queries.append(eq)
    for addr in queries:
        for qv in geocode_query_variants(addr):
            c = kakao_geocode(qv, cache, key)
            if c:
                return c
        q2 = f"{addr} {place_name}"
        c = kakao_geocode(q2, cache, key)
        if c:
            return c
        for qv in geocode_query_variants(addr):
            c = kakao_keyword_geocode(qv, cache, key)
            if c:
                return c
    for q in (
        f"마포구 {place_name}",
        place_name,
        f"서울 {place_name}",
    ):
        c = kakao_keyword_geocode(q, cache, key)
        if c:
            return c
    return None


def _str(v) -> str:
    if v is None:
        return ""
    return str(v).strip()


def pick_address(row: dict) -> tuple[str, list[str]]:
    """(주소, 지오코딩 실패 시 시도할 대체 주소들)."""
    road = _str(row.get("road_nm_addr"))
    lot = re.sub(r"\s+", " ", _str(row.get("lotno_addr")))
    lctn = re.sub(r"\s+", " ", _str(row.get("lctn")))
    alts: list[str] = []
    if road:
        primary = re.sub(r"\s+", " ", road)
        for a in (lot, lctn):
            if a and a != primary and a not in alts:
                alts.append(a)
        return primary, alts
    primary = lot or lctn
    return re.sub(r"\s+", " ", primary), []


def ref_date_from_row(row: dict) -> str | None:
    v = row.get("data_updt_ymd")
    if v is not None and v != "":
        try:
            n = float(v)
            if n > 1e11:
                return datetime.fromtimestamp(n / 1000, tz=timezone.utc).strftime(
                    "%Y-%m-%d"
                )
        except (ValueError, TypeError, OSError):
            pass
    lm = _str(row.get("last_mdfcn_ymd"))
    m = re.match(r"(\d{4}-\d{2}-\d{2})", lm)
    if m:
        return m.group(1)
    return None


def is_open_business(row: dict) -> bool:
    """인허가 영업상태코드 01 = 영업/정상."""
    return _str(row.get("sals_stts_cd")) == "01"


def parse_json(path: Path) -> list[dict]:
    with open(path, "r", encoding="utf-8") as f:
        root = json.load(f)
    rows_in = root.get("DATA") or []
    out: list[dict] = []
    for row in rows_in:
        if not is_open_business(row):
            continue
        name = _str(row.get("bplc_nm"))
        addr, addr_alts = pick_address(row)
        if not name or not addr:
            continue
        if not addr.startswith("서울"):
            addr = f"서울특별시 마포구 {addr}"
        addr_alts = [a if a.startswith("서울") else f"서울특별시 마포구 {a}" for a in addr_alts]
        out.append(
            {
                "name": name,
                "roadAddress": addr,
                "address": addr,
                "businessStatus": "영업",
                "hasTrashBag": True,
                "hasSpecialBag": False,
                "hasLargeWasteSticker": False,
                "adminVerified": False,
                "dataReferenceDate": ref_date_from_row(row),
                "_source_file": path.name,
                "_geocode_alts": addr_alts,
            }
        )
    return out


def discover_paths(argv: list[str]) -> list[Path]:
    if argv:
        return [Path(a).expanduser().resolve() for a in argv]
    paths: list[Path] = []
    for p in DOWNLOADS.glob("*.json"):
        n = p.name
        if "마포" in n and ("봉투" in n or "종량제" in n or "쓰레기" in n):
            paths.append(p.resolve())
    uniq: dict[str, Path] = {str(p): p for p in paths}
    return sorted(uniq.values(), key=lambda x: x.name)


def main():
    if not KAKAO_REST_KEY:
        print("KAKAO_REST_KEY 또는 KAKAO_REST_API_KEY 가 필요합니다.")
        raise SystemExit(1)

    paths = discover_paths(sys.argv[1:])
    if not paths:
        print("JSON 경로를 인자로 주거나, Downloads 에 마포 관련 JSON 을 두세요.")
        raise SystemExit(1)

    raw: list[dict] = []
    for p in paths:
        if not p.exists():
            print(f"건너뜀 (없음): {p}")
            continue
        part = parse_json(p)
        print(f"  {p.name}: 영업 {len(part)}건")
        raw.extend(part)

    by_key: dict[str, dict] = {}
    for s in raw:
        k0 = norm_key(s["name"], s["roadAddress"])
        if k0 not in by_key:
            by_key[k0] = s
        else:
            prev = by_key[k0]
            rd = prev.get("dataReferenceDate")
            sd = s.get("dataReferenceDate")
            if sd and (not rd or sd > rd):
                prev["dataReferenceDate"] = sd

    unique = list(by_key.values())
    print(f"중복 제거 후 {len(unique)}건")

    cache = load_cache()
    geocode_failed: list[str] = []
    print("지오코딩 중…")
    for i, s in enumerate(unique):
        alts = s.pop("_geocode_alts", None) or []
        coords = resolve_coords(
            s["roadAddress"], s["name"], cache, KAKAO_REST_KEY, alts
        )
        if not coords:
            geocode_failed.append(s["name"])
            s["lat"] = None
            s["lng"] = None
        else:
            s["lat"], s["lng"] = coords
        if (i + 1) % 50 == 0:
            save_cache(cache)
            print(f"  …{i + 1}/{len(unique)}")
    save_cache(cache)

    if geocode_failed:
        print(f"좌표 실패 {len(geocode_failed)}건 (일부): {geocode_failed[:20]}")

    with open(OUT_JSON, "r", encoding="utf-8") as f:
        existing = json.load(f)

    max_id = 0
    for e in existing:
        try:
            max_id = max(max_id, int(str(e.get("id", "0"))))
        except ValueError:
            pass

    exist_keys = {
        norm_key(e.get("name", ""), e.get("roadAddress") or e.get("address", ""))
        for e in existing
    }

    added = 0
    updated = 0
    for s in unique:
        k0 = norm_key(s["name"], s["roadAddress"])
        if k0 in exist_keys:
            for e in existing:
                if norm_key(e.get("name", ""), e.get("roadAddress") or e.get("address", "")) != k0:
                    continue
                ch = False
                nt = bool(e.get("hasTrashBag")) or s["hasTrashBag"]
                ns = bool(e.get("hasSpecialBag")) or s["hasSpecialBag"]
                if nt != bool(e.get("hasTrashBag")):
                    ch = True
                if ns != bool(e.get("hasSpecialBag")):
                    ch = True
                e["hasTrashBag"] = nt
                e["hasSpecialBag"] = ns
                if s.get("dataReferenceDate"):
                    od = e.get("dataReferenceDate") or ""
                    if not od or (s["dataReferenceDate"] > od):
                        e["dataReferenceDate"] = s["dataReferenceDate"]
                        ch = True
                if (e.get("lat") is None or e.get("lng") is None) and s.get("lat") is not None:
                    e["lat"] = s["lat"]
                    e["lng"] = s["lng"]
                    ch = True
                if ch:
                    updated += 1
                break
            continue
        if s.get("lat") is None:
            continue
        max_id += 1
        exist_keys.add(k0)
        rec = {
            "id": str(max_id),
            "name": s["name"],
            "lat": s["lat"],
            "lng": s["lng"],
            "roadAddress": s["roadAddress"],
            "address": s["address"],
            "businessStatus": s["businessStatus"],
            "hasTrashBag": s["hasTrashBag"],
            "hasSpecialBag": s["hasSpecialBag"],
            "hasLargeWasteSticker": False,
            "adminVerified": False,
        }
        if s.get("dataReferenceDate"):
            rec["dataReferenceDate"] = s["dataReferenceDate"]
        existing.append(rec)
        added += 1

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    print(f"갱신 {updated}건, 신규 {added}건 → 총 {len(existing)} 저장: {OUT_JSON}")


if __name__ == "__main__":
    main()
