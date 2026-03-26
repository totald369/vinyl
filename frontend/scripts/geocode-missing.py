#!/usr/bin/env python3
"""
Geocode stores that have addresses but no coordinates,
then merge them into the final stores.sample.json.
"""

import csv
import json
import math
import time
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

CSV_PATH = Path.home() / "Downloads" / "전국종량제봉투판매소표준데이터 (1).csv"
OUT_PATH = Path(__file__).resolve().parent.parent / "public" / "data" / "stores.sample.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache.json"

KAKAO_REST_KEY = "fd1c94f46de9b58135650e9fba4b5320"
GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"

BATCH_SAVE_EVERY = 200
REQUEST_DELAY = 0.05  # 50ms between requests (within Kakao's rate limit)

def to_float(val):
    if val is None:
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (ValueError, TypeError):
        return None

def is_positive_indicator(val):
    if val is None:
        return False
    s = str(val).strip().upper()
    return s in ("Y", "YES", "판매", "가능", "1", "TRUE")

def kakao_geocode(address):
    """Try address search first, then keyword search as fallback."""
    coords = _kakao_address_search(address)
    if coords:
        return coords
    return _kakao_keyword_search(address)

def _kakao_address_search(query):
    params = urllib.parse.urlencode({"query": query})
    url = f"{GEOCODE_URL}?{params}"
    req = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {KAKAO_REST_KEY}"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            docs = data.get("documents", [])
            if docs:
                lat = to_float(docs[0].get("y"))
                lng = to_float(docs[0].get("x"))
                if lat and lng:
                    return (lat, lng)
    except (urllib.error.URLError, urllib.error.HTTPError, Exception):
        pass
    return None

def _kakao_keyword_search(query):
    params = urllib.parse.urlencode({"query": query, "size": "1"})
    url = f"{KEYWORD_URL}?{params}"
    req = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {KAKAO_REST_KEY}"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            docs = data.get("documents", [])
            if docs:
                lat = to_float(docs[0].get("y"))
                lng = to_float(docs[0].get("x"))
                if lat and lng:
                    return (lat, lng)
    except (urllib.error.URLError, urllib.error.HTTPError, Exception):
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

def main():
    print("Reading CSV...")
    rows_needing_geocode = []
    rows_with_coords = []

    with open(CSV_PATH, "r", encoding="euc-kr", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get("판매소명") or "").strip()
            if not name:
                continue
            lat = to_float(row.get("위도"))
            lng = to_float(row.get("경도"))
            if lat is not None and lng is not None:
                rows_with_coords.append(row)
            else:
                road = (row.get("소재지도로명주소") or "").strip()
                jibun = (row.get("소재지지번주소") or "").strip()
                if road or jibun:
                    rows_needing_geocode.append(row)

    print(f"  Already have coords: {len(rows_with_coords)}")
    print(f"  Need geocoding: {len(rows_needing_geocode)}")

    cache = load_cache()
    print(f"  Geocode cache entries: {len(cache)}")

    geocoded_count = 0
    failed_count = 0
    cached_hit = 0
    api_calls = 0

    for i, row in enumerate(rows_needing_geocode):
        name = (row.get("판매소명") or "").strip()
        road = (row.get("소재지도로명주소") or "").strip()
        jibun = (row.get("소재지지번주소") or "").strip()
        query = road or jibun

        cache_key = query

        if cache_key in cache:
            result = cache[cache_key]
            if result:
                row["위도"] = str(result[0])
                row["경도"] = str(result[1])
                geocoded_count += 1
            else:
                failed_count += 1
            cached_hit += 1
            continue

        coords = kakao_geocode(query)
        api_calls += 1

        if coords:
            cache[cache_key] = coords
            row["위도"] = str(coords[0])
            row["경도"] = str(coords[1])
            geocoded_count += 1
        else:
            cache[cache_key] = None
            failed_count += 1

        if api_calls % 50 == 0:
            print(f"  Progress: {i+1}/{len(rows_needing_geocode)} | geocoded={geocoded_count} failed={failed_count} api_calls={api_calls}")

        if api_calls % BATCH_SAVE_EVERY == 0:
            save_cache(cache)

        time.sleep(REQUEST_DELAY)

    save_cache(cache)
    print(f"\nGeocoding complete:")
    print(f"  API calls: {api_calls}")
    print(f"  Cache hits: {cached_hit}")
    print(f"  Successfully geocoded: {geocoded_count}")
    print(f"  Failed (no result): {failed_count}")

    # Now merge all into final output
    print("\nBuilding final JSON...")
    all_rows = rows_with_coords + [r for r in rows_needing_geocode if to_float(r.get("위도")) is not None]

    stores = []
    for idx, row in enumerate(all_rows):
        name = (row.get("판매소명") or "").strip()
        lat = to_float(row.get("위도"))
        lng = to_float(row.get("경도"))
        if not name or lat is None or lng is None:
            continue

        road_addr = (row.get("소재지도로명주소") or "").strip() or None
        jibun_addr = (row.get("소재지지번주소") or "").strip() or None
        biz_status = (row.get("영업상태명") or "").strip() or None
        ref_date = (row.get("데이터기준일자") or "").strip() or None
        sticker_yn = (row.get("대형폐기물스티커판매여부") or "").strip()

        store = {
            "id": str(idx + 1),
            "name": name,
            "lat": lat,
            "lng": lng,
        }
        if road_addr:
            store["roadAddress"] = road_addr
        if jibun_addr:
            store["address"] = jibun_addr
        elif road_addr:
            store["address"] = road_addr
        if biz_status:
            store["businessStatus"] = biz_status

        store["hasTrashBag"] = True
        store["hasSpecialBag"] = False
        store["hasLargeWasteSticker"] = is_positive_indicator(sticker_yn)
        store["adminVerified"] = False

        if ref_date:
            store["dataReferenceDate"] = ref_date

        stores.append(store)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(stores, f, ensure_ascii=False, indent=2)

    print(f"\nFinal output: {len(stores)} stores")
    print(f"Written to: {OUT_PATH}")
    print(f"File size: {OUT_PATH.stat().st_size / 1024:.1f} KB")

if __name__ == "__main__":
    main()
