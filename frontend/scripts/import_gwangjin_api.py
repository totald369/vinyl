#!/usr/bin/env python3
"""
광진구 JMT 종량제봉투 판매처 API → stores.sample.json 병합.

※ 구청 PDF 공개 목록이 있으면 import_gwangjin_pdf.py 를 사용하는 것이 더 정확합니다(400건 상한 등).

엔드포인트:
  .../selectValidBongtuSellers?latitude=&longitude=&radius=&minusMonths=&piCode=

규칙:
  - pbios 의 고유 pcdName 기준
  - '마대' 포함 시 hasSpecialBag (불연성 마대)
  - 일반/영업용/재사용 중 하나라도 있으면 hasTrashBag
  - pcdName 이 전부 '음식물용' 인 업소는 제외
  - 좌표는 API 값 우선, 없거나 비정상이면 카카오 지오코딩

참고: 이 API는 models 가 약 400건으로 상한이 있는 것으로 보이며, 여러 중심·반경으로
시험해도 동일한 400 id 집합이 반환되는 경우가 많습니다. --grid 옵션으로 격자 조회 시
union 합니다(데이터가 늘어나면 자동 반영).

사용:
  frontend/.env.local 의 KAKAO_REST_API_KEY (또는 KAKAO_REST_KEY)
  python3 scripts/import_gwangjin_api.py
  python3 scripts/import_gwangjin_api.py --grid
"""

from __future__ import annotations

import argparse
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

FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.sample.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-gwangjin.json"

API_BASE = (
    "https://gwangjin.jmtwaste.kr/jmfwaste/part/common/commonCompany/"
    "selectValidBongtuSellers"
)

# 광진구 대략적 범위 (격자 조회용)
LAT_MIN, LAT_MAX = 37.518, 37.572
LNG_MIN, LNG_MAX = 127.058, 127.112
GRID_STEP = 0.012
GRID_RADIUS = 1.8

DEFAULT_LAT, DEFAULT_LNG = 37.548, 127.078
DEFAULT_RADIUS = 5.0
DEFAULT_MINUS_MONTHS = 10

FETCH_DELAY = 0.08


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

TRASH_PCD = frozenset({"일반", "영업용", "재사용"})


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
    spaced_alley = re.sub(r"([가-힣]+로)(\d+)(길)", r"\1 \2\3", base)
    if spaced_alley != base and spaced_alley not in seen:
        seen.append(spaced_alley)
        base = spaced_alley
    if "," in base:
        head = base.split(",")[0].strip()
        if head and head not in seen:
            seen.append(head)
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
        f"광진구 {place_name}",
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


def grid_centers() -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    la = LAT_MIN
    while la <= LAT_MAX + 1e-9:
        lo = LNG_MIN
        while lo <= LNG_MAX + 1e-9:
            out.append((round(la, 5), round(lo, 5)))
            lo += GRID_STEP
        la += GRID_STEP
    return out


def fetch_bongtu_sellers(lat: float, lng: float, radius: float, minus_months: int) -> list[dict]:
    q = urllib.parse.urlencode(
        {
            "latitude": lat,
            "longitude": lng,
            "radius": radius,
            "minusMonths": minus_months,
            "piCode": "",
        }
    )
    url = f"{API_BASE}?{q}"
    req = urllib.request.Request(url, headers={"User-Agent": "vinyl-importer/1.0"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    obj = data.get("output", {}).get("object") or {}
    return list(obj.get("models") or [])


def collect_unique_pcd_names(pbios: list | None) -> set[str]:
    names: set[str] = set()
    for p in pbios or []:
        n = _str(p.get("pcdName"))
        if n:
            names.add(n)
    return names


def flags_from_pcd_names(names: set[str]) -> tuple[bool, bool] | None:
    """(hasTrashBag, hasSpecialBag) 또는 음식물만이면 None."""
    if not names:
        return None
    if names <= {"음식물용"}:
        return None
    has_special = any("마대" in n for n in names)
    has_trash = bool(names & TRASH_PCD)
    return has_trash, has_special


def ref_date_from_model(m: dict) -> str | None:
    for key in ("lastUpdateDttm", "regDttm"):
        v = m.get(key)
        if v is None:
            continue
        try:
            n = float(v)
            if n > 1e11:
                return datetime.fromtimestamp(n / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        except (ValueError, TypeError, OSError):
            pass
    return None


def normalize_seoul_address(addr: str) -> str:
    a = re.sub(r"\s+", " ", addr.strip())
    if not a:
        return a
    if a.startswith("서울"):
        return a
    if a.startswith("광진구"):
        return f"서울특별시 {a}"
    return f"서울특별시 광진구 {a}"


def api_coords(m: dict) -> tuple[float, float] | None:
    lat = to_float(m.get("latitude"))
    lng = to_float(m.get("longitude"))
    if lat is None or lng is None:
        return None
    # 서울 광진구 대략 범위
    if not (37.4 < lat < 37.7 and 126.9 < lng < 127.2):
        return None
    return lat, lng


def model_to_record(m: dict) -> dict | None:
    if _str(m.get("useYn")) == "N":
        return None
    name = _str(m.get("comName"))
    addr_raw = _str(m.get("address")) or _str(m.get("oldAddress"))
    if not name or not addr_raw:
        return None
    pcd = collect_unique_pcd_names(m.get("pbios"))
    fl = flags_from_pcd_names(pcd)
    if fl is None:
        return None
    has_trash, has_special = fl
    road = normalize_seoul_address(addr_raw)
    old = _str(m.get("oldAddress"))
    alts: list[str] = []
    if old and old != addr_raw:
        alts.append(normalize_seoul_address(old))
    return {
        "name": name,
        "roadAddress": road,
        "address": road,
        "businessStatus": "영업",
        "hasTrashBag": has_trash,
        "hasSpecialBag": has_special,
        "hasLargeWasteSticker": False,
        "adminVerified": False,
        "dataReferenceDate": ref_date_from_model(m),
        "_api_latlng": api_coords(m),
        "_geocode_alts": alts,
        "_companyInfoSeqNo": m.get("companyInfoSeqNo"),
    }


def merge_fetched_models(use_grid: bool, minus_months: int) -> dict[int, dict]:
    by_id: dict[int, dict] = {}
    if use_grid:
        centers = grid_centers()
        print(f"격자 {len(centers)}회 조회 (R={GRID_RADIUS}km)…")
        for i, (lat, lng) in enumerate(centers):
            try:
                models = fetch_bongtu_sellers(lat, lng, GRID_RADIUS, minus_months)
            except (urllib.error.URLError, urllib.error.HTTPError, Exception) as e:
                print(f"  경고: ({lat},{lng}) 실패: {e}")
                models = []
            for m in models:
                k = m.get("companyInfoSeqNo")
                if k is not None:
                    by_id[int(k)] = m
            if (i + 1) % 6 == 0:
                print(f"  …{i + 1}/{len(centers)} 누적 업체 {len(by_id)}")
            time.sleep(FETCH_DELAY)
    else:
        print(
            f"단일 조회 (lat={DEFAULT_LAT}, lng={DEFAULT_LNG}, R={DEFAULT_RADIUS}km)…"
        )
        models = fetch_bongtu_sellers(
            DEFAULT_LAT, DEFAULT_LNG, DEFAULT_RADIUS, minus_months
        )
        for m in models:
            k = m.get("companyInfoSeqNo")
            if k is not None:
                by_id[int(k)] = m
    return by_id


def main():
    ap = argparse.ArgumentParser(description="광진구 종량제 API → stores.sample.json")
    ap.add_argument(
        "--grid",
        action="store_true",
        help="격자로 여러 번 호출해 union (API 상한 완화 시 유리)",
    )
    ap.add_argument(
        "--minus-months",
        type=int,
        default=DEFAULT_MINUS_MONTHS,
        help=f"minusMonths 파라미터 (기본 {DEFAULT_MINUS_MONTHS})",
    )
    args = ap.parse_args()

    if not KAKAO_REST_KEY:
        print("KAKAO_REST_KEY 또는 KAKAO_REST_API_KEY 가 필요합니다.")
        raise SystemExit(1)

    raw_models = merge_fetched_models(args.grid, args.minus_months)
    print(f"API 원본 업체 수: {len(raw_models)}")

    parsed: list[dict] = []
    for m in raw_models.values():
        rec = model_to_record(m)
        if rec:
            parsed.append(rec)

    by_key: dict[str, dict] = {}
    for s in parsed:
        k0 = norm_key(s["name"], s["roadAddress"])
        if k0 not in by_key:
            by_key[k0] = s
        else:
            prev = by_key[k0]
            prev["hasTrashBag"] = bool(prev["hasTrashBag"]) or bool(s["hasTrashBag"])
            prev["hasSpecialBag"] = bool(prev["hasSpecialBag"]) or bool(s["hasSpecialBag"])
            sd, pd = s.get("dataReferenceDate"), prev.get("dataReferenceDate")
            if sd and (not pd or sd > pd):
                prev["dataReferenceDate"] = sd

    unique = list(by_key.values())
    print(f"필터·이름·주소 기준 고유: {len(unique)}건")

    cache = load_cache()
    geocode_failed: list[str] = []
    print("좌표 확정·지오코딩…")
    for i, s in enumerate(unique):
        alts = s.pop("_geocode_alts", None) or []
        api_ll = s.pop("_api_latlng", None)
        if api_ll:
            s["lat"], s["lng"] = api_ll[0], api_ll[1]
        else:
            coords = resolve_coords(
                s["roadAddress"], s["name"], cache, KAKAO_REST_KEY, alts
            )
            if coords:
                s["lat"], s["lng"] = coords
            else:
                s["lat"] = s["lng"] = None
                geocode_failed.append(s["name"])
        s.pop("_companyInfoSeqNo", None)
        if (i + 1) % 80 == 0:
            save_cache(cache)
            print(f"  …{i + 1}/{len(unique)}")
    save_cache(cache)

    if geocode_failed:
        print(f"좌표 실패 {len(geocode_failed)}건 (일부): {geocode_failed[:15]}")

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
