#!/usr/bin/env python3
"""
전북 완주군 종량제봉투 판매소 (완주시설관리공단) → stores.jeonbuk-wanju-trash.json

출처: https://www.wjss.or.kr/index.do?menuCd=DOM_000000102003002000
      읍면별 menuCd DOM_000000102003002000 ~ 002013 (002001은 경천면 중복)

  python3 scripts/import_wanju_trash_from_wjss.py
  python3 scripts/import_wanju_trash_from_wjss.py --merge-sample

KAKAO_REST_API_KEY: frontend/.env.local
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.jeonbuk-wanju-trash.json"
SAMPLE_JSON = FRONTEND / "public" / "data" / "stores.sample.json"
CACHE_PATH = SCRIPT_DIR / "geocode-cache-jeonbuk-wanju-trash.json"
BASE_URL = "https://www.wjss.or.kr/index.do"
REF_DATE = "2025-07-25"

# 경천면(000) ~ 봉동읍(013); 001은 000과 동일 본문
DISTRICT_MENU_SUFFIXES = [f"{i:03d}" for i in range(14) if i != 1]

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
GEOCODE_DELAY = 0.07

WS_RE = re.compile(r"[ \t\r\n\v\f]+")
ROW_RE = re.compile(
    r"<tr[^>]*>\s*<td[^>]*>([^<]*)</td>\s*<td[^>]*>([^<]*)</td>\s*<td[^>]*>([^<]*)</td>",
    re.I | re.S,
)
WANJU_ADDR_RE = re.compile(r"완주군\s+[가-힣]+(?:면|읍)")


def _load_dotenv_local() -> None:
    p = FRONTEND / ".env.local"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        # .env.local 줄바꿈 누락 시 값이 이어붙는 경우 방지
        for sep in ("NEXT_PUBLIC_", "NEXT_", "#"):
            if sep in v:
                v = v.split(sep, 1)[0].strip()
        if k and k not in os.environ:
            os.environ[k] = v


_load_dotenv_local()


def collapse(s: str) -> str:
    return WS_RE.sub(" ", (s or "").replace("\xa0", " ")).strip()


def parse_float(v: object) -> float | None:
    try:
        f = float(str(v).strip())
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def load_kakao_key() -> str | None:
    return (
        os.environ.get("KAKAO_REST_API_KEY", "").strip()
        or os.environ.get("KAKAO_REST_KEY", "").strip()
    )


def in_wanju_bbox(lat: float, lng: float) -> bool:
    """완주군 전역·인근 전주 덕진(이서면 인접) 허용."""
    return 35.65 <= lat <= 36.15 and 126.78 <= lng <= 127.35


def is_wanju_official_addr(addr: str) -> bool:
    a = collapse(addr)
    return "완주군" in a or ("전주시" in a and "덕진구" in a)


def normalize_eupmyeon(raw: str) -> str:
    t = collapse(raw)
    if t.endswith("읍") or t.endswith("면"):
        return t
    if t == "삼례":
        return "삼례읍"
    return t


def fetch_district_rows(menu_suffix: str) -> list[tuple[str, str, str]]:
    menu_cd = f"DOM_000000102003002{menu_suffix}"
    url = f"{BASE_URL}?menuCd={menu_cd}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; vinyl-data-import/1.0)"})
    html = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", errors="replace")
    rows: list[tuple[str, str, str]] = []
    for m in ROW_RE.finditer(html):
        eup, name, addr = [collapse(x) for x in m.groups()]
        if eup in ("읍면", "---") or "판매소" in eup or not name or not addr:
            continue
        rows.append((normalize_eupmyeon(eup), name, addr))
    return rows


def scrape_all() -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for suffix in DISTRICT_MENU_SUFFIXES:
        for eup, name, addr in fetch_district_rows(suffix):
            key = f"{name}|{addr}"
            if key in seen:
                continue
            seen.add(key)
            out.append({"eupmyeon": eup, "name": name, "roadAddress": addr})
        time.sleep(0.15)
    return out


def load_cache() -> dict[str, list[float]]:
    if not CACHE_PATH.is_file():
        return {}
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_cache(c: dict[str, list[float]]) -> None:
    CACHE_PATH.write_text(json.dumps(c, ensure_ascii=False, indent=2), encoding="utf-8")


def addr_region_ok(blob: str, query: str) -> bool:
    """지오코딩 결과가 완주·인근 전주 덕진인지 확인."""
    b = collapse(blob)
    q = collapse(query)
    if "완주군" in b or "완주군" in q:
        return True
    if ("전주시" in b or "전주" in q) and ("덕진" in b or "덕진" in q):
        return True
    return is_wanju_official_addr(q)


def kakao_search(url: str, query: str, key: str) -> tuple[float | None, float | None]:
    req = urllib.request.Request(
        f"{url}?{urllib.parse.urlencode({'query': query, 'size': '15'})}",
        headers={"Authorization": f"KakaoAK {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None, None
    for d in data.get("documents") or []:
        lat = parse_float(d.get("y"))
        lng = parse_float(d.get("x"))
        if lat is None or lng is None or not in_wanju_bbox(lat, lng):
            continue
        road = collapse(str(d.get("road_address_name") or d.get("place_name") or ""))
        jibeon = collapse(str(d.get("address_name") or ""))
        if not addr_region_ok(f"{road} {jibeon}", query):
            continue
        return lat, lng
    return None, None


def geocode_row(name: str, addr: str, eup: str, key: str) -> tuple[float | None, float | None]:
    variants = [addr, re.sub(r"\s*\([^)]*\)\s*", " ", addr), f"{name} {eup}", f"{name} 완주군"]
    for q in variants:
        q = collapse(q)
        if not q:
            continue
        lat, lng = kakao_search(GEOCODE_URL, q, key)
        if lat is None:
            lat, lng = kakao_search(KEYWORD_URL, q, key)
        if lat is not None:
            return lat, lng
    return None, None


def build_stores(rows: list[dict], key: str | None, allow_api: bool) -> list[dict]:
    cache = load_cache()
    stores: list[dict] = []
    misses = 0
    geo_n = 0

    for i, row in enumerate(rows, start=1):
        name = row["name"]
        addr = row["roadAddress"]
        eup = row["eupmyeon"]
        ck = hashlib.sha1(f"wanju:{name}:{addr}".encode()).hexdigest()[:28]

        if ck in cache and len(cache[ck]) == 2:
            lat, lng = float(cache[ck][0]), float(cache[ck][1])
        elif allow_api and key:
            lat, lng = geocode_row(name, addr, eup, key)
            if lat is None:
                misses += 1
                print(f"[geocode 실패] {name}\t{addr}", file=sys.stderr)
                continue
            cache[ck] = [lat, lng]
            geo_n += 1
            if geo_n % 5 == 0:
                save_cache(cache)
            time.sleep(GEOCODE_DELAY)
        else:
            misses += 1
            continue

        rid = hashlib.sha1(f"{name}\n{addr}".encode()).hexdigest()[:20]
        rec = {
            "id": f"jeonbuk-wanju-trash-{rid}",
            "name": name,
            "lat": round(float(lat), 7),
            "lng": round(float(lng), 7),
            "roadAddress": addr,
            "address": addr,
            "businessStatus": "영업",
            "hasTrashBag": True,
            "hasSpecialBag": False,
            "hasLargeWasteSticker": False,
            "adminVerified": True,
            "dataReferenceDate": REF_DATE,
        }
        stores.append(rec)

    save_cache(cache)
    stores.sort(key=lambda x: (x["roadAddress"], x["name"]))
    print(f"geocoded={len(stores)} misses={misses}", file=sys.stderr)
    return stores


def norm_key(name: str, addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").strip().lower())
    return f"{collapse(name).lower()}|{a}"


def is_sample_wanju_trash_store(e: dict) -> bool:
    if not e.get("hasTrashBag"):
        return False
    blob = f"{e.get('roadAddress', '')} {e.get('address', '')}"
    if WANJU_ADDR_RE.search(blob):
        return True
    return False


def merge_into_sample(incoming: list[dict]) -> None:
    existing = json.loads(SAMPLE_JSON.read_text(encoding="utf-8"))
    before = len(existing)
    existing = [e for e in existing if not is_sample_wanju_trash_store(e)]
    removed = before - len(existing)

    max_id = 0
    for e in existing:
        try:
            max_id = max(max_id, int(str(e.get("id", "0"))))
        except ValueError:
            pass

    keys = {
        norm_key(e.get("name", ""), e.get("roadAddress") or e.get("address", ""))
        for e in existing
    }
    added = 0
    for s in incoming:
        k = norm_key(s["name"], s.get("roadAddress", ""))
        if k in keys:
            continue
        max_id += 1
        row = {**s, "id": str(max_id), "adminVerified": False}
        existing.append(row)
        keys.add(k)
        added += 1

    SAMPLE_JSON.write_text(
        json.dumps(existing, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"sample: removed {removed} old 완주군 trash rows, added {added}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-kakao", action="store_true")
    ap.add_argument("--merge-sample", action="store_true")
    args = ap.parse_args()

    key = load_kakao_key()
    allow = not args.skip_kakao and bool(key)
    if not args.skip_kakao and not key:
        print("KAKAO_REST_API_KEY 필요 (frontend/.env.local)", file=sys.stderr)
        raise SystemExit(1)

    print("scraping wjss.or.kr …", file=sys.stderr)
    rows = scrape_all()
    print(f"scraped {len(rows)} stores", file=sys.stderr)

    stores = build_stores(rows, key, allow)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(stores, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(stores)} → {OUT_JSON}")

    if args.merge_sample:
        merge_into_sample(stores)


if __name__ == "__main__":
    main()
