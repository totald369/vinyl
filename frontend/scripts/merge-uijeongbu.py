#!/usr/bin/env python3
"""
Geocode 의정부 건설마대 판매소 CSV and merge into stores.sample.json.
hasSpecialBag=true (불연성/건설마대).
"""

import csv
import json
import math
import os
import time
import urllib.request
import urllib.parse
from pathlib import Path

# 우선 사용자가 지정한 파일, 없으면 동일 이름 복사본
_CANDIDATES = [
    Path.home() / "Downloads" / "의정부도시공사_건설마대 판매소 현황_20250610 (1).csv",
    Path.home() / "Downloads" / "의정부도시공사_건설마대 판매소 현황_20250610.csv",
]

OUT_PATH = Path(__file__).resolve().parent.parent / "public" / "data" / "stores.sample.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache.json"
KAKAO_REST_KEY = os.environ.get("KAKAO_REST_API_KEY") or "fd1c94f46de9b58135650e9fba4b5320"
GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"


def resolve_csv_path():
    for p in _CANDIDATES:
        if p.exists():
            return p
    return None


def to_float(val):
    if val is None:
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (ValueError, TypeError):
        return None


def kakao_geocode(address, place_name=None):
    coords = _kakao_api(GEOCODE_URL, address)
    if coords:
        return coords
    coords = _kakao_api(KEYWORD_URL, address)
    if coords:
        return coords
    if place_name:
        q = f"{place_name.strip()} 의정부"
        return _kakao_api(KEYWORD_URL, q)
    return None


def _kakao_api(base_url, query):
    params = urllib.parse.urlencode({"query": query, "size": "1"})
    url = f"{base_url}?{params}"
    req = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {KAKAO_REST_KEY}"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            docs = data.get("documents", [])
            if docs:
                lat = to_float(docs[0].get("y"))
                lng = to_float(docs[0].get("x"))
                if lat and lng:
                    return (lat, lng)
    except Exception:
        pass
    return None


def load_cache():
    if CACHE_PATH.exists():
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache):
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)


def coords_from_cache(cache, key):
    v = cache.get(key)
    if not v or not isinstance(v, (list, tuple)) or len(v) != 2:
        return None
    lat, lng = to_float(v[0]), to_float(v[1])
    if lat is None or lng is None:
        return None
    return (lat, lng)


def put_coords_cache(cache, key, coords):
    if coords:
        cache[key] = [coords[0], coords[1]]


def normalize_address_for_geocode(addr: str) -> str:
    a = (addr or "").strip()
    if not a:
        return a
    if a.startswith("의정부시"):
        return "경기도 " + a
    if not a.startswith("경기"):
        return "경기도 " + a
    return a


def read_csv_rows(path: Path):
    last_err = None
    for enc in ("utf-8-sig", "utf-8", "euc-kr", "cp949"):
        try:
            with open(path, "r", encoding=enc, errors="strict") as f:
                return list(csv.DictReader(f)), enc
        except Exception as e:
            last_err = e
    with open(path, "r", encoding="euc-kr", errors="replace") as f:
        return list(csv.DictReader(f)), "euc-kr(fallback)"


def find_uijeongbu_store_by_name(existing, name: str):
    n = name.strip()
    for s in existing:
        if s["name"].strip() != n:
            continue
        loc = (s.get("roadAddress") or "") + (s.get("address") or "")
        if "의정부" in loc:
            return s
    return None


def main():
    CSV_PATH = resolve_csv_path()
    if not CSV_PATH:
        print("CSV 없음. 다음 경로 중 하나를 Downloads에 두세요:")
        for p in _CANDIDATES:
            print(f"  - {p}")
        return

    print(f"CSV: {CSV_PATH}")
    rows, enc = read_csv_rows(CSV_PATH)
    print(f"Reading 의정부 건설마대 CSV ({enc})… → {len(rows)} rows")

    with open(OUT_PATH, "r", encoding="utf-8") as f:
        existing = json.load(f)
    print(f"  기존 stores: {len(existing)}")

    max_id = max(int(s["id"]) for s in existing)
    cache = load_cache()
    new_stores = []
    geocoded = 0
    failed = 0
    updated = 0

    for row in rows:
        name = (row.get("판매소 상호명") or "").strip()
        raw_addr = (row.get("판매소 주소") or "").strip()
        ref_date = (row.get("데이터기준일") or "").strip()

        if not name or not raw_addr:
            continue

        match = find_uijeongbu_store_by_name(existing, name)
        if match:
            match["hasSpecialBag"] = True
            if ref_date:
                match["dataReferenceDate"] = ref_date
            print(f"  기존 갱신: {name} → hasSpecialBag=true")
            updated += 1
            continue

        addr = normalize_address_for_geocode(raw_addr)
        cache_key = "uj:" + addr
        coords = coords_from_cache(cache, cache_key)
        if coords is None:
            coords = kakao_geocode(addr, place_name=name)
            put_coords_cache(cache, cache_key, coords)
            time.sleep(0.05)

        if not coords:
            failed += 1
            print(f"  지오코딩 실패: {name} ({addr})")
            continue

        geocoded += 1
        max_id += 1
        new_stores.append(
            {
                "id": str(max_id),
                "name": name,
                "lat": coords[0],
                "lng": coords[1],
                "roadAddress": addr,
                "address": raw_addr or addr,
                "businessStatus": "영업",
                "hasTrashBag": False,
                "hasSpecialBag": True,
                "hasLargeWasteSticker": False,
                "adminVerified": False,
                "dataReferenceDate": ref_date or "2025-06-10",
            }
        )

    save_cache(cache)
    merged = existing + new_stores
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    print("\n의정부 건설마대 병합:")
    print(f"  기존 매장 갱신: {updated}")
    print(f"  신규 지오코딩: {geocoded}")
    print(f"  실패: {failed}")
    print(f"  최종 매장 수: {len(merged)} (+{len(new_stores)} 신규)")
    print(f"Written: {OUT_PATH}")


if __name__ == "__main__":
    main()
