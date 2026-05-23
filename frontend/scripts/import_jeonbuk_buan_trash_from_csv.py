#!/usr/bin/env python3
"""
전북특별자치도 부안군 종량제봉투 판매소 CSV → stores.jeonbuk-buan-trash.json

입력: 지정판매소코드, 사업장이름, 대표자, 전화번호, 사업장주소

  python3 scripts/import_jeonbuk_buan_trash_from_csv.py \\
    --input ~/Downloads/전북특별자치도\\ 부안군_쓰레기\\ 종량제\\ 봉투\\ 물류전산\\ 종량제봉투판매정보_20251023.csv

KAKAO_REST_API_KEY: frontend/.env.local
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.jeonbuk-buan-trash.json"
CACHE_PATH = SCRIPT_DIR / "geocode-cache-jeonbuk-buan-trash.json"
DL = Path.home() / "Downloads"
DEFAULT_INPUT = DL / "전북특별자치도 부안군_쓰레기 종량제 봉투 물류전산 종량제봉투판매정보_20251023.csv"
REF_DATE = "2025-10-23"
CACHE_VERSION = "v1"

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
COORD2_URL = "https://dapi.kakao.com/v2/local/geo/coord2address.json"
GEOCODE_DELAY = 0.06

WS_RE = re.compile(r"[ \t\r\n\v\f]+")
_REF_FILENAME = re.compile(r"(\d{4})(\d{2})(\d{2})")


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
        if k and k not in os.environ:
            os.environ[k] = v


_load_dotenv_local()


def collapse(s: str) -> str:
    return WS_RE.sub(" ", (s or "").replace("\xa0", " ")).strip()


def decode_csv(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp949", "euc-kr", "utf-8"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("cp949", errors="replace")


def load_kakao_key() -> str | None:
    return (
        os.environ.get("KAKAO_REST_API_KEY", "").strip()
        or os.environ.get("KAKAO_REST_KEY", "").strip()
    )


def parse_float(v: object) -> float | None:
    try:
        f = float(str(v).strip())
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def ref_date_from_path(p: Path) -> str:
    m = _REF_FILENAME.search(p.name)
    if m:
        y, mo, d = m.groups()
        return f"{y}-{mo}-{d}"
    return REF_DATE


def in_buan_bbox(lat: float, lng: float) -> bool:
    # 변산면(서부)·위도면(섬) 포함
    return 35.55 <= lat <= 35.78 and 126.24 <= lng <= 126.86


def buan_in_text(blob: str) -> bool:
    return "부안" in (blob or "").replace(" ", "")


def format_display_addr(raw: str) -> str:
    a = collapse(raw)
    a = a.replace("전북특별치도", "전북특별자치도")
    a = re.sub(r"^전북\s+", "전북특별자치도 ", a)
    a = re.sub(r"^전라북도\s+", "전북특별자치도 ", a)
    if not a.startswith("전북") and "부안" in a.replace(" ", ""):
        if a.startswith("부안군"):
            return f"전북특별자치도 {a}"
        return f"전북특별자치도 부안군 {a}"
    return a


def normalize_addr(addr_raw: str) -> str:
    a = collapse(addr_raw)
    a = re.sub(r",\s*.*$", "", a)
    a = re.sub(r"\s*\([^)]*\)\s*", " ", a)
    return format_display_addr(a)


def geocode_target(full: str) -> str:
    return normalize_addr(full)


def buan_tail(full: str) -> str:
    for prefix in (
        "전북특별자치도 부안군 ",
        "전북특별자치도 ",
        "전북 부안군 ",
        "부안군 ",
    ):
        if full.startswith(prefix):
            return collapse(full[len(prefix) :])
    return full


def geocode_query_variants(road_full: str, name: str) -> list[str]:
    target = geocode_target(road_full)
    tail = buan_tail(target)
    out: list[str] = []
    seen: set[str] = set()

    def push(q: str) -> None:
        t = collapse(q)
        if t and t not in seen:
            seen.add(t)
            out.append(t)

    push(f"전북 부안군 {tail}")
    push(f"전북특별자치도 부안군 {tail}")
    push(target)
    if re.search(r"-\d+\s*$", tail):
        rt = re.sub(r"-\d+\s*$", "", tail).strip()
        push(f"전북 부안군 {rt}")
    road_only = re.sub(r"\s+\d+(?:-\d+)?\s*$", "", tail).strip()
    if road_only and road_only != tail:
        push(f"전북 부안군 {road_only}")
    m = re.match(r"^(.+?(?:읍|면|동))", tail.replace(" ", ""))
    if m:
        push(f"전북 부안군 {collapse(m.group(1))}")
    push(f"{name} 부안")
    push(f"{name} 부안군")
    return out


@dataclass
class GeoHit:
    lat: float
    lng: float
    road: str
    jibeon: str


def load_cache() -> dict[str, list]:
    if not CACHE_PATH.is_file():
        return {}
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_cache(c: dict[str, list]) -> None:
    CACHE_PATH.write_text(json.dumps(c, ensure_ascii=False, indent=2), encoding="utf-8")


def _doc_blob(d: dict) -> str:
    parts: list[str] = []

    def touch(v: object) -> None:
        if isinstance(v, str) and v.strip():
            parts.append(v.strip())
        elif isinstance(v, dict):
            for sk in ("address_name", "region_1depth_name", "region_2depth_name"):
                s = v.get(sk)
                if isinstance(s, str) and s.strip():
                    parts.append(s.strip())

    touch(d.get("address_name"))
    touch(d.get("road_address"))
    touch(d.get("road_address_name"))
    touch(d.get("place_name"))
    return " ".join(parts)


def coord2address(lng: float, lat: float, kakao_key: str) -> tuple[str, str]:
    req = urllib.request.Request(
        f"{COORD2_URL}?{urllib.parse.urlencode({'x': lng, 'y': lat, 'input_coord': 'WGS84'})}",
        headers={"Authorization": f"KakaoAK {kakao_key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return "", ""
    docs = data.get("documents") or []
    if not docs:
        return "", ""
    d = docs[0]
    jibeon = format_display_addr(str((d.get("address") or {}).get("address_name") or ""))
    road = format_display_addr(str((d.get("road_address") or {}).get("address_name") or ""))
    return jibeon, road


def parse_address_doc(d: dict, kakao_key: str) -> GeoHit | None:
    lat = parse_float(d.get("y"))
    lng = parse_float(d.get("x"))
    if lat is None or lng is None or not in_buan_bbox(lat, lng):
        return None
    if not buan_in_text(_doc_blob(d)):
        return None
    jibeon = format_display_addr(str(d.get("address_name") or ""))
    ra = d.get("road_address")
    road = ""
    if isinstance(ra, dict):
        road = format_display_addr(str(ra.get("address_name") or ""))
    if not road:
        cj, cr = coord2address(lng, lat, kakao_key)
        road = cr or cj
        if not jibeon:
            jibeon = cj
    if not jibeon:
        jibeon = format_display_addr(str(d.get("address_name") or ""))
    return GeoHit(lat=lat, lng=lng, road=road or jibeon, jibeon=jibeon or road)


def parse_keyword_doc(d: dict, kakao_key: str) -> GeoHit | None:
    lat = parse_float(d.get("y"))
    lng = parse_float(d.get("x"))
    if lat is None or lng is None or not in_buan_bbox(lat, lng):
        return None
    if not buan_in_text(_doc_blob(d)):
        return None
    jibeon = format_display_addr(str(d.get("address_name") or ""))
    road = format_display_addr(str(d.get("road_address_name") or ""))
    if not road or not jibeon:
        cj, cr = coord2address(lng, lat, kakao_key)
        road = road or cr
        jibeon = jibeon or cj
    if not road and not jibeon:
        return None
    return GeoHit(lat=lat, lng=lng, road=road or jibeon, jibeon=jibeon or road)


def kakao_get(url: str, query: str, key: str) -> list[dict]:
    req = urllib.request.Request(
        f"{url}?{urllib.parse.urlencode({'query': query, 'size': '15'})}",
        headers={"Authorization": f"KakaoAK {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return []
    return data.get("documents") or []


def area_fallback(road_full: str, key: str, display_road: str) -> GeoHit | None:
    tail = buan_tail(geocode_target(road_full))
    m = re.match(r"^(.+?(?:읍|면|동))", tail.replace(" ", ""))
    if not m:
        return None
    area = collapse(m.group(1))
    for q in (f"전북 부안군 {area}", f"전북특별자치도 부안군 {area}"):
        for d in kakao_get(GEOCODE_URL, q, key):
            hit = parse_address_doc(d, key)
            if hit:
                hit.road = display_road
                cj, _ = coord2address(hit.lng, hit.lat, key)
                hit.jibeon = cj or hit.jibeon
                return hit
    return None


def resolve_geocode(road_full: str, name: str, key: str, display_road: str) -> GeoHit | None:
    for q in geocode_query_variants(road_full, name):
        for d in kakao_get(GEOCODE_URL, q, key):
            hit = parse_address_doc(d, key)
            if hit:
                return hit
        for d in kakao_get(KEYWORD_URL, q, key):
            hit = parse_keyword_doc(d, key)
            if hit:
                return hit
    return area_fallback(road_full, key, display_road)


def cache_key(code: str, name: str, road: str) -> str:
    return hashlib.sha1(f"{CACHE_VERSION}:{code}:{name}:{road}".encode()).hexdigest()[:28]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    ap.add_argument("--skip-kakao", action="store_true")
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()
    inp = args.input.expanduser()
    if not inp.is_file():
        raise SystemExit(f"파일 없음: {inp}")

    key = load_kakao_key()
    allow = not args.skip_kakao and bool(key)
    if not args.skip_kakao and not key:
        raise SystemExit("KAKAO_REST_API_KEY 필요 (frontend/.env.local)")

    ref_date = ref_date_from_path(inp)
    text = decode_csv(inp.read_bytes())
    cache = {} if args.refresh else load_cache()
    out: list[dict] = []
    geo_n = 0
    misses = 0
    seen: set[str] = set()

    for r in csv.DictReader(text.splitlines()):
        code = collapse(r.get("지정판매소코드") or "")
        name = collapse(r.get("사업장이름") or "")
        addr_raw = collapse(r.get("사업장주소") or "")
        if not name or not addr_raw:
            continue

        display_road = geocode_target(addr_raw)
        if not display_road or "부안" not in display_road.replace(" ", ""):
            continue

        dk = f"{code}|{name}|{display_road}"
        if dk in seen:
            continue
        seen.add(dk)

        ck = cache_key(code, name, display_road)
        hit: GeoHit | None = None

        if not args.refresh and ck in cache:
            raw = cache[ck]
            if isinstance(raw, list) and len(raw) >= 2:
                lat, lng = float(raw[0]), float(raw[1])
                road = str(raw[2]) if len(raw) > 2 else display_road
                jib = str(raw[3]) if len(raw) > 3 else ""
                if not jib or not road:
                    cj, cr = coord2address(lng, lat, key)
                    jib = jib or cj or display_road
                    road = road or cr or display_road
                hit = GeoHit(lat=lat, lng=lng, road=road, jibeon=jib)

        if hit is None and allow:
            hit = resolve_geocode(addr_raw, name, key, display_road)
            if hit is None:
                misses += 1
                print(f"[geocode 실패] {name}\t{display_road}", file=sys.stderr)
                continue
            cj, cr = coord2address(hit.lng, hit.lat, key)
            hit.road = display_road
            hit.jibeon = cj or hit.jibeon or display_road
            cache[ck] = [hit.lat, hit.lng, hit.road, hit.jibeon]
            geo_n += 1
            if geo_n % 40 == 0:
                save_cache(cache)
                print(f"[geocode] {geo_n} …", file=sys.stderr)
            time.sleep(GEOCODE_DELAY)
        elif hit is None:
            misses += 1
            continue

        rid = hashlib.sha1(f"{code}\n{name}\n{display_road}".encode()).hexdigest()[:20]
        out.append(
            {
                "id": f"jeonbuk-buan-trash-{rid}",
                "name": name,
                "lat": round(float(hit.lat), 7),
                "lng": round(float(hit.lng), 7),
                "roadAddress": display_road,
                "address": hit.jibeon or display_road,
                "businessStatus": "영업",
                "hasTrashBag": True,
                "hasSpecialBag": False,
                "hasLargeWasteSticker": False,
                "adminVerified": True,
                "dataReferenceDate": ref_date,
            }
        )

    save_cache(cache)
    out.sort(key=lambda x: (x["name"], x["roadAddress"]))
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(out)} → {OUT_JSON} (ref_date={ref_date}, api≈{geo_n}, miss={misses})")

    if out:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from append_activity import record_region_data_added

        record_region_data_added(["부안군"])


if __name__ == "__main__":
    main()
