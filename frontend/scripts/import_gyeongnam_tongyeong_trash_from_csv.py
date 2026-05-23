#!/usr/bin/env python3
"""
경상남도 통영시 종량제봉투 판매소 CSV → stores.gyeongnam-tongyeong-trash.json

입력: 연번, 상호명, 행정동, 도로명주소, 데이터 기준일자

  python3 scripts/import_gyeongnam_tongyeong_trash_from_csv.py \\
    --input ~/Downloads/경상남도\\ 통영시_종량제봉투\\ 판매소\\ 현황_20260306.csv

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
OUT_JSON = FRONTEND / "public" / "data" / "stores.gyeongnam-tongyeong-trash.json"
CACHE_PATH = SCRIPT_DIR / "geocode-cache-gyeongnam-tongyeong-trash.json"
DL = Path.home() / "Downloads"
DEFAULT_INPUT = DL / "경상남도 통영시_종량제봉투 판매소 현황_20260306.csv"
CACHE_VERSION = "v1"

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
COORD2_URL = "https://dapi.kakao.com/v2/local/geo/coord2address.json"
GEOCODE_DELAY = 0.06

WS_RE = re.compile(r"[ \t\r\n\v\f]+")
ROAD_RE = re.compile(r"(로|길|대로)\s*(\d+)")


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


def in_tongyeong_bbox(lat: float, lng: float) -> bool:
    return 34.68 <= lat <= 35.02 and 128.18 <= lng <= 128.52


def tongyeong_in_text(blob: str) -> bool:
    return "통영" in (blob or "").replace(" ", "")


def format_display_addr(raw: str) -> str:
    a = collapse(raw)
    a = re.sub(r"^경남\s+", "경상남도 ", a)
    if a.startswith("경상남도"):
        return a
    if a.startswith("통영시"):
        return f"경상남도 {a}"
    if tongyeong_in_text(a) or re.search(r"(동|읍|면)\s", a):
        return f"경상남도 통영시 {a}"
    return a


def build_road_address(admin_dong: str, road_raw: str) -> str:
    dong = collapse(admin_dong)
    road = collapse(road_raw)
    if not road:
        return ""
    if dong and not road.startswith(dong):
        road = f"{dong} {road}"
    return format_display_addr(road)


def tongyeong_tail(full: str) -> str:
    for prefix in ("경상남도 통영시 ", "경상남도 ", "경남 통영시 ", "통영시 "):
        if full.startswith(prefix):
            return collapse(full[len(prefix) :])
    return full


def geocode_query_variants(road_full: str, name: str) -> list[str]:
    tail = tongyeong_tail(road_full)
    out: list[str] = []
    seen: set[str] = set()

    def push(q: str) -> None:
        t = collapse(q)
        if t and t not in seen:
            seen.add(t)
            out.append(t)

    push(f"경남 통영시 {tail}")
    push(f"경상남도 통영시 {tail}")
    push(road_full)
    if re.search(r"-\d+\s*$", tail):
        rt = re.sub(r"-\d+\s*$", "", tail).strip()
        push(f"경남 통영시 {rt}")
    road_only = re.sub(r"\s+\d+(?:-\d+)?\s*$", "", tail).strip()
    if road_only and road_only != tail:
        push(f"경남 통영시 {road_only}")
    m = re.match(r"^(.+?(?:동|읍|면))\s", tail)
    if m:
        push(f"경남 통영시 {m.group(1)}")
    push(f"{name} 통영")
    push(f"{name} 통영시")
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
    if lat is None or lng is None or not in_tongyeong_bbox(lat, lng):
        return None
    if not tongyeong_in_text(_doc_blob(d)):
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
    if lat is None or lng is None or not in_tongyeong_bbox(lat, lng):
        return None
    if not tongyeong_in_text(_doc_blob(d)):
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


def area_fallback(road_full: str, key: str, orig_road: str) -> GeoHit | None:
    tail = tongyeong_tail(road_full)
    m = re.match(r"^(.+?(?:동|읍|면))", tail.replace(" ", ""))
    if not m:
        return None
    area = collapse(m.group(1))
    for q in (f"경남 통영시 {area}", f"경상남도 통영시 {area}"):
        for d in kakao_get(GEOCODE_URL, q, key):
            hit = parse_address_doc(d, key)
            if hit:
                hit.road = orig_road
                cj, cr = coord2address(hit.lng, hit.lat, key)
                hit.jibeon = cj or hit.jibeon
                if not hit.road:
                    hit.road = cr or orig_road
                return hit
    return None


def resolve_geocode(road_full: str, name: str, key: str) -> GeoHit | None:
    for q in geocode_query_variants(road_full, name):
        for d in kakao_get(GEOCODE_URL, q, key):
            hit = parse_address_doc(d, key)
            if hit:
                return hit
        for d in kakao_get(KEYWORD_URL, q, key):
            hit = parse_keyword_doc(d, key)
            if hit:
                return hit
    return area_fallback(road_full, key, road_full)


def cache_key(name: str, road: str) -> str:
    return hashlib.sha1(f"{CACHE_VERSION}:{name}:{road}".encode()).hexdigest()[:28]


def read_rows(path: Path) -> list[dict[str, str]]:
    text = decode_csv(path.read_bytes())
    reader = csv.DictReader(text.splitlines())
    out: list[dict[str, str]] = []
    for r in reader:
        name = collapse(r.get("상호명") or "")
        dong = collapse(r.get("행정동") or "")
        road_raw = collapse(r.get("도로명주소") or "")
        ref = collapse(r.get("데이터 기준일자") or "")
        if not name or not road_raw:
            continue
        out.append(
            {
                "name": name,
                "adminDong": dong,
                "roadRaw": road_raw,
                "refDate": ref or "2026-03-06",
            }
        )
    return out


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

    raw_rows = read_rows(inp)
    cache = {} if args.refresh else load_cache()
    out: list[dict] = []
    geo_n = 0
    fallback_n = 0
    misses = 0
    seen: set[str] = set()

    for row in raw_rows:
        name = row["name"]
        road_full = build_road_address(row["adminDong"], row["roadRaw"])
        ref_date = row["refDate"]
        if not road_full or "통영" not in road_full.replace(" ", ""):
            continue

        dk = f"{name}|{road_full}"
        if dk in seen:
            continue
        seen.add(dk)

        ck = cache_key(name, road_full)
        hit: GeoHit | None = None

        if not args.refresh and ck in cache:
            raw = cache[ck]
            if isinstance(raw, list) and len(raw) >= 2:
                lat, lng = float(raw[0]), float(raw[1])
                road = str(raw[2]) if len(raw) > 2 else road_full
                jib = str(raw[3]) if len(raw) > 3 else ""
                if not jib or not road:
                    cj, cr = coord2address(lng, lat, key)
                    jib = jib or cj or road_full
                    road = road or cr or road_full
                hit = GeoHit(lat=lat, lng=lng, road=road, jibeon=jib)

        if hit is None and allow:
            hit = resolve_geocode(road_full, name, key)
            if hit is None:
                misses += 1
                print(f"[geocode 실패] {name}\t{road_full}", file=sys.stderr)
                continue
            if hit.road != road_full:
                cj, cr = coord2address(hit.lng, hit.lat, key)
                if not hit.jibeon:
                    hit.jibeon = cj or road_full
            hit.road = road_full
            cache[ck] = [hit.lat, hit.lng, hit.road, hit.jibeon]
            geo_n += 1
            if geo_n % 50 == 0:
                save_cache(cache)
                print(f"[geocode] {geo_n} …", file=sys.stderr)
            time.sleep(GEOCODE_DELAY)
        elif hit is None:
            misses += 1
            continue

        rid = hashlib.sha1(f"{name}\n{road_full}".encode()).hexdigest()[:20]
        out.append(
            {
                "id": f"gyeongnam-tongyeong-trash-{rid}",
                "name": name,
                "lat": round(float(hit.lat), 7),
                "lng": round(float(hit.lng), 7),
                "roadAddress": road_full,
                "address": hit.jibeon or road_full,
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
    print(
        f"wrote {len(out)} → {OUT_JSON} "
        f"(api≈{geo_n}, fallback≈{fallback_n}, miss={misses})"
    )


if __name__ == "__main__":
    main()
