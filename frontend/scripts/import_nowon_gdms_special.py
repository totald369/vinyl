#!/usr/bin/env python3
"""
노원구 GDMS 물품판매소 지도 (main.asp) 에서 특수규격(10L·20L) 판매처를 수집해
stores.sample.json 의 hasSpecialBag 을 갱신합니다.

원본: POST http://119.192.103.73/gdms_maps/main.asp
      site=0221, dong=<동코드>, item=7010|7020

매칭: 인허가 상호와 현장 표기가 다를 수 있어 도로명/지번 문자열 겹침을 우선합니다.
미매칭 건은 카카오 지오코딩 후 120m 이내 최근접 노원구 매장에 플래그하고,
그래도 없으면 지오코딩 성공 시 신규 행으로 추가합니다(--skip-new 로 끌 수 있음).

.env.local: KAKAO_REST_API_KEY (또는 KAKAO_REST_KEY)
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
from pathlib import Path

BASE_URL = "http://119.192.103.73/gdms_maps/main.asp"
FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.sample.json"
CACHE_GEO = Path(__file__).resolve().parent / "geocode-cache-nowon-gdms.json"

DONG_CODES = [
    "101",
    "102",
    "103",
    "201",
    "202",
    "301",
    "302",
    "401",
    "402",
    "403",
    "404",
    "501",
    "502",
    "503",
    "505",
    "506",
    "508",
    "509",
    "510",
]
SPECIAL_ITEMS = [("7010", "특수규격10리터"), ("7020", "특수규격20리터")]

GETD_RE = re.compile(
    r"""name=["']getD["'][^>]*value=[']([\s\S]*?)[']\s*>""",
    re.IGNORECASE,
)
ROW_RE = re.compile(
    r"^(.+)/(.+)/(\d{4}-\d{2}-\d{2})/(.*)$",
)


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
KAKAO_KEY = (
    os.environ.get("KAKAO_REST_KEY", "").strip()
    or os.environ.get("KAKAO_REST_API_KEY", "").strip()
)
GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
GEOCODE_DELAY = 0.07


def norm_store_name(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").strip().lower())
    return f"{norm_store_name(name).lower()}|{a}"


def compact_addr(s: str) -> str:
    s = (s or "").replace("서울특별시", "").replace("서울시", "")
    s = re.sub(r"\s+", "", s)
    return s.lower()


def name_sig(s: str) -> str:
    s = norm_store_name(s)
    s = re.sub(r"[^0-9a-z가-힣]", "", s.lower())
    return s


def to_full_road(addr: str) -> str:
    addr = re.sub(r"\s+", " ", (addr or "").strip())
    if not addr:
        return addr
    if addr.startswith("서울"):
        return addr
    if addr.startswith("노원구"):
        return "서울특별시 " + addr
    return "서울특별시 노원구 " + addr


def fetch_post(dong: str, item: str) -> str:
    body = urllib.parse.urlencode(
        {"site": "0221", "dong": dong, "item": item}
    ).encode("ascii")
    req = urllib.request.Request(
        BASE_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (compatible; vinyl-data-import/1.0)",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        raw = resp.read()
    try:
        return raw.decode("euc-kr")
    except UnicodeDecodeError:
        return raw.decode("euc-kr", errors="replace")


def parse_getd(html: str) -> str:
    m = GETD_RE.search(html)
    return (m.group(1) if m else "").strip()


def parse_rows(getd_blob: str) -> list[dict]:
    rows: list[dict] = []
    for line in getd_blob.splitlines():
        line = line.strip()
        if not line:
            continue
        m = ROW_RE.match(line)
        if not m:
            continue
        name, addr, ref_date, phone = m.group(1), m.group(2), m.group(3), m.group(4)
        rows.append(
            {
                "name": name.strip(),
                "address": addr.strip(),
                "roadAddress": to_full_road(addr.strip()),
                "dataReferenceDate": ref_date,
                "phone": phone.strip(),
            }
        )
    return rows


def scrape_all() -> list[dict]:
    seen: set[tuple[str, str]] = set()
    out: list[dict] = []
    for dong in DONG_CODES:
        for item_code, _label in SPECIAL_ITEMS:
            try:
                html = fetch_post(dong, item_code)
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
                print(f"  요청 실패 dong={dong} item={item_code}: {e}", file=sys.stderr)
                continue
            blob = parse_getd(html)
            for row in parse_rows(blob):
                key = (name_sig(row["name"]), compact_addr(row["roadAddress"]))
                if key in seen:
                    continue
                seen.add(key)
                out.append(row)
            time.sleep(0.15)
    return out


def to_float(val):
    if val is None:
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (ValueError, TypeError):
        return None


def load_cache():
    if CACHE_GEO.exists():
        return json.loads(CACHE_GEO.read_text(encoding="utf-8"))
    return {}


def save_cache(c: dict):
    CACHE_GEO.write_text(json.dumps(c, ensure_ascii=False), encoding="utf-8")


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


def kakao_keyword_geocode(query: str, cache: dict) -> tuple[float, float] | None:
    if not KAKAO_KEY:
        return None
    h = hashlib.sha256(("kw:" + query).encode("utf-8")).hexdigest()[:16]
    if h in cache:
        lat, lng = cache[h]
        return float(lat), float(lng)
    q2 = urllib.parse.urlencode({"query": query, "size": "1"})
    r = urllib.request.Request(
        f"{KEYWORD_URL}?{q2}", headers={"Authorization": f"KakaoAK {KAKAO_KEY}"}
    )
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
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


def resolve_gdms_coords(row: dict, cache: dict) -> tuple[float, float] | None:
    """신규 행용: 주소 변형 + 키워드 검색까지 시도."""
    road = row["roadAddress"]
    name = row["name"]
    for qv in geocode_query_variants(road):
        c = kakao_geocode(qv, cache)
        if c:
            return c
    c = kakao_geocode(f"{road} {name}", cache)
    if c:
        return c
    for qv in geocode_query_variants(road):
        c = kakao_keyword_geocode(qv, cache)
        if c:
            return c
    for q in (f"노원구 {name}", name, f"서울 노원구 {name}"):
        c = kakao_keyword_geocode(q, cache)
        if c:
            return c
    return None


def in_nowon_bbox(lat: float, lng: float) -> bool:
    """카카오 오탐 방지용 거친 범위."""
    return 37.58 <= lat <= 37.70 and 127.02 <= lng <= 127.12


def kakao_geocode(address: str, cache: dict) -> tuple[float, float] | None:
    if not KAKAO_KEY:
        return None
    h = hashlib.sha256(address.encode("utf-8")).hexdigest()[:16]
    if h in cache:
        lat, lng = cache[h]
        return float(lat), float(lng)
    q = urllib.parse.urlencode({"query": address})
    url = f"{GEOCODE_URL}?{q}"
    r = urllib.request.Request(
        url, headers={"Authorization": f"KakaoAK {KAKAO_KEY}"}
    )
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
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
    q2 = urllib.parse.urlencode({"query": address, "size": "1"})
    r2 = urllib.request.Request(
        f"{KEYWORD_URL}?{q2}", headers={"Authorization": f"KakaoAK {KAKAO_KEY}"}
    )
    try:
        with urllib.request.urlopen(r2, timeout=10) as resp:
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


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def addr_overlap(a: str, b: str, min_run: int = 8) -> bool:
    """인허가 주소는 짧고 GDMS 는 상세(동·호)까지 붙는 경우가 많아 부분 문자열로 비교."""
    ca, cb = compact_addr(a), compact_addr(b)
    if len(ca) < min_run or len(cb) < min_run:
        return False
    if ca in cb or cb in ca:
        return True
    shorter, longer = (ca, cb) if len(ca) <= len(cb) else (cb, ca)
    max_n = min(len(shorter), 24)
    n = max_n
    while n >= min_run:
        for i in range(len(shorter) - n + 1):
            if shorter[i : i + n] in longer:
                return True
        n -= 1
    return False


def pick_by_name(candidates: list[dict], scraped_name: str) -> dict | None:
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    sig = name_sig(scraped_name)
    best, best_score = None, -1
    for e in candidates:
        es = name_sig(e.get("name", ""))
        score = 0
        if sig and es:
            if sig == es:
                score = 100
            elif sig in es or es in sig:
                score = 50
            else:
                score = len(set(sig) & set(es))
        if score > best_score:
            best_score = score
            best = e
    return best


def match_store(
    scraped: dict,
    nowon_stores: list[dict],
    cache: dict,
) -> dict | None:
    road = scraped["roadAddress"]
    # 1) 주소 겹침
    cands = [
        e
        for e in nowon_stores
        if addr_overlap(road, e.get("roadAddress") or e.get("address") or "")
    ]
    hit = pick_by_name(cands, scraped["name"])
    if hit:
        return hit
    # 2) 상호만 동일·유일
    sig = name_sig(scraped["name"])
    if sig:
        name_hits = [
            e for e in nowon_stores if name_sig(e.get("name", "")) == sig
        ]
        if len(name_hits) == 1:
            return name_hits[0]
    # 3) 지오코딩 근접
    if not KAKAO_KEY:
        return None
    latlng = kakao_geocode(road, cache)
    if not latlng:
        latlng = kakao_geocode(
            f"노원구 {scraped['address']}", cache
        )
    if not latlng:
        return None
    slat, slng = latlng
    best, best_d = None, 999999.0
    for e in nowon_stores:
        elat, elng = to_float(e.get("lat")), to_float(e.get("lng"))
        if elat is None or elng is None:
            continue
        d = haversine_m(slat, slng, elat, elng)
        if d < best_d:
            best_d, best = d, e
    if best is not None and best_d <= 120:
        return best
    return None


def main():
    dry = "--dry-run" in sys.argv
    skip_new = "--skip-new" in sys.argv

    print("GDMS 특수규격 판매처 수집 중…")
    scraped = scrape_all()
    print(f"  고유 판매처 {len(scraped)}건")

    if dry:
        for r in scraped[:15]:
            print(f"  - {r['name']} | {r['roadAddress']}")
        if len(scraped) > 15:
            print(f"  … 외 {len(scraped) - 15}건")
        print("(dry-run: JSON 미저장)")
        return

    if not KAKAO_KEY:
        print("KAKAO_REST_API_KEY(또는 KAKAO_REST_KEY)가 없으면 매칭·신규 좌표를 붙일 수 없습니다.")
        raise SystemExit(1)

    data = json.loads(OUT_JSON.read_text(encoding="utf-8"))
    nowon = [
        e
        for e in data
        if "노원구" in (e.get("roadAddress") or "") + (e.get("address") or "")
    ]
    print(f"  노원구 기존 매장 {len(nowon)}건 (전체 {len(data)}건)")

    max_id = 0
    for e in data:
        try:
            max_id = max(max_id, int(str(e.get("id", "0"))))
        except ValueError:
            pass
    exist_keys = {
        norm_key(e.get("name", ""), e.get("roadAddress") or e.get("address", ""))
        for e in data
    }

    cache = load_cache()
    matched = 0
    no_match_rows: list[dict] = []

    for row in scraped:
        hit = match_store(row, nowon, cache)
        if hit:
            matched += 1
            hit["hasSpecialBag"] = True
            rd = row.get("dataReferenceDate")
            if rd:
                old = hit.get("dataReferenceDate") or ""
                if not old or rd > old:
                    hit["dataReferenceDate"] = rd
        else:
            no_match_rows.append(row)

    added_new = 0
    skipped_bbox = 0
    geo_fail_new: list[str] = []

    if not skip_new and no_match_rows:
        print(f"  미매칭 {len(no_match_rows)}건 → 신규 행 지오코딩 시도…")
        for i, row in enumerate(no_match_rows):
            k = norm_key(row["name"], row["roadAddress"])
            if k in exist_keys:
                continue
            coords = resolve_gdms_coords(row, cache)
            if not coords:
                geo_fail_new.append(f"{row['name']} | {row['roadAddress']}")
                continue
            lat, lng = coords
            if not in_nowon_bbox(lat, lng):
                skipped_bbox += 1
                geo_fail_new.append(f"(범위밖) {row['name']} | {row['roadAddress']}")
                continue
            max_id += 1
            exist_keys.add(k)
            rec = {
                "id": str(max_id),
                "name": row["name"],
                "lat": lat,
                "lng": lng,
                "roadAddress": row["roadAddress"],
                "address": row["roadAddress"],
                "businessStatus": "영업",
                "hasTrashBag": False,
                "hasSpecialBag": True,
                "hasLargeWasteSticker": False,
                "adminVerified": False,
            }
            if row.get("dataReferenceDate"):
                rec["dataReferenceDate"] = row["dataReferenceDate"]
            data.append(rec)
            nowon.append(rec)
            added_new += 1
            if (i + 1) % 40 == 0:
                save_cache(cache)
                print(f"    …신규 처리 {i + 1}/{len(no_match_rows)}")

    save_cache(cache)

    OUT_JSON.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"hasSpecialBag 갱신(기존 매칭) {matched}/{len(scraped)}건, "
        f"신규 추가 {added_new}건 → 총 {len(data)}건 저장: {OUT_JSON}"
    )
    if skip_new and no_match_rows:
        print(f"  (--skip-new: 미매칭 {len(no_match_rows)}건은 신규 추가 안 함)")
        print("  미매칭 샘플:")
        for row in no_match_rows[:12]:
            print(f"    · {row['name']} | {row['roadAddress']}")

    if skipped_bbox:
        print(f"  노원구 bbox 밖으로 제외 {skipped_bbox}건 (키워드 오탐 방지)")

    remain = len(no_match_rows) - matched - added_new
    if geo_fail_new:
        print(f"  신규 좌표 실패·제외 {len(geo_fail_new)}건 (처음 8개):")
        for line in geo_fail_new[:8]:
            print(f"    · {line}")


if __name__ == "__main__":
    main()
