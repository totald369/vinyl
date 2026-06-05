#!/usr/bin/env python3
"""
경상남도 고성군 종량제봉투 판매소 xls(읍면별 시트) → stores.gyeongnam-goseong-trash.json

시트(총괄 제외): 상호명 | 사업장 소재지 | 비고(폐업 등)
  - 폐업·집계 행 제외, 영업 중 판매소만 hasTrashBag=true
  - 본 파일에 불연성마대 구분 열 없음 → hasSpecialBag=false

  pip install 'xlrd==1.2.0'
  python3 scripts/import_gyeongnam_goseong_trash_from_xls.py \\
    --input ~/Downloads/고성군\\ 판매소\\ 지정\\ 현황\\(현행화\\)..xls

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
from dataclasses import dataclass
from datetime import date
from pathlib import Path

try:
    import xlrd
except ImportError as e:
    raise SystemExit("xlrd 필요: pip install 'xlrd==1.2.0'") from e

FRONTEND = Path(__file__).resolve().parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.gyeongnam-goseong-trash.json"
CACHE_PATH = SCRIPT_DIR / "geocode-cache-gyeongnam-goseong-trash.json"
DL = Path.home() / "Downloads"
DEFAULT_INPUT = DL / "고성군 판매소 지정 현황(현행화)..xls"
SKIP_SHEETS = {"총괄"}
REF_DATE = date.today().isoformat()
CACHE_VERSION = "v1-goseong-gn"

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
COORD2_URL = "https://dapi.kakao.com/v2/local/geo/coord2address.json"
GEOCODE_DELAY = 0.06

WS_RE = re.compile(r"[ \t\r\n\v\f]+")
ROAD_RE = re.compile(r"[가-힣\d]+(?:로|길|대로|번길)")
LOT_RE = re.compile(
    r"^(?P<prefix>.+?리\s*)(?P<main>\d+)(?:-(?P<sub>\d+))?\s*$"
)
AREA_RE = re.compile(
    r"(고성읍|삼산면|하일면|하이면|상리면|대가면|영현면|영오면|개천면|구만면|회화면|마암면|동해면|거류면)"
)


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
    return WS_RE.sub(" ", (str(s or "")).replace("\xa0", " ")).strip()


def cell_str(v: object) -> str:
    if v is None or v == "":
        return ""
    if isinstance(v, float) and v == int(v):
        return str(int(v))
    return str(v).strip()


def is_closed(note: str, name: str) -> bool:
    blob = f"{note} {name}"
    return "폐업" in blob or "폐지" in blob


def is_summary_row(name: str, addr: str) -> bool:
    if not name or not addr:
        return True
    if name in ("상호명", "구  분", "계"):
        return True
    if re.fullmatch(r"[\d.]+", addr.replace(" ", "")):
        return True
    if "편의점" in name and re.search(r"^\d", addr):
        return True
    return False


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


def in_goseong_bbox(lat: float, lng: float) -> bool:
    return 34.72 <= lat <= 35.18 and 128.02 <= lng <= 128.58


def goseong_in_text(blob: str) -> bool:
    t = (blob or "").replace(" ", "")
    if any(x in t for x in ("강원", "강원특별", "간성읍", "거진읍", "속초", "인제")):
        return False
    if "고성군" in t or ("경상남도" in t and "고성" in t):
        return True
    return ("경남" in t or "경상남" in t) and "고성" in t


def format_display_addr(raw: str) -> str:
    a = collapse(raw)
    a = re.sub(r"^경남\s+", "경상남도 ", a)
    if not a:
        return ""
    if a.startswith("경상남도"):
        return a
    if a.startswith("고성군"):
        return f"경상남도 {a}"
    return f"경상남도 고성군 {a}"


def normalize_addr(addr_raw: str, sheet_myeon: str) -> str:
    a = collapse(addr_raw)
    if "," in a:
        a = a.split(",")[0].strip()
    a = re.sub(r"\s*\([^)]*\)\s*", " ", a)
    a = re.sub(r"\s*번지\s*", " ", a)
    if not re.search(r"고성군", a):
        if re.match(r"^(고성읍|.+면)", a):
            a = f"고성군 {a}"
        elif sheet_myeon:
            a = f"고성군 {sheet_myeon} {a}"
    a = re.sub(r"고성군(?=[가-힣])", "고성군 ", a)
    a = re.sub(r"([읍면동리])([가-힣]{2,}(?:로|길|대로|번길))", r"\1 \2", a)
    a = re.sub(r"(\d+번길)(\d)", r"\1 \2", a)
    a = re.sub(r"(대로)(\d)", r"\1 \2", a)
    return format_display_addr(a)


def goseong_tail(addr_raw: str, sheet_myeon: str) -> str:
    norm = normalize_addr(addr_raw, sheet_myeon)
    for prefix in ("경상남도 고성군 ", "경상남도 ", "경남 고성군 ", "고성군 "):
        if norm.startswith(prefix):
            return collapse(norm[len(prefix) :])
    return norm


def is_likely_jibeon(tail: str) -> bool:
    t = tail.replace(" ", "")
    if ROAD_RE.search(tail):
        return False
    return bool(re.search(r"\d", t))


def lot_query_variants(tail: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()

    def push(s: str) -> None:
        t = collapse(s)
        if t and t not in seen:
            seen.add(t)
            out.append(t)

    push(tail)
    m = LOT_RE.match(tail)
    if m:
        prefix, main, sub = m.group("prefix"), m.group("main"), m.group("sub")
        subs: list[str | None] = [sub, "1", "2", "3"] if sub else [None]
        for s in subs:
            push(f"{prefix}{main}" if s is None else f"{prefix}{main}-{s}")
    return out


def road_format_variants(addr: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()

    def push(s: str) -> None:
        t = collapse(s)
        if t and t not in seen:
            seen.add(t)
            out.append(t)

    push(addr)
    compact = addr.replace(" ", "")
    push(compact)
    push(re.sub(r"(\d+번길)(\d+)$", r"\1 \2", compact))
    push(re.sub(r"([가-힣]+로)(\d+)", r"\1 \2", compact))
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


def cache_key(name: str, addr: str) -> str:
    return hashlib.sha1(f"{CACHE_VERSION}:{name}:{addr}".encode()).hexdigest()[:28]


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
    time.sleep(GEOCODE_DELAY)
    return data.get("documents") or []


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
    time.sleep(GEOCODE_DELAY)
    return jibeon, road


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


def parse_address_doc(d: dict, kakao_key: str) -> GeoHit | None:
    lat = parse_float(d.get("y"))
    lng = parse_float(d.get("x"))
    if lat is None or lng is None or not in_goseong_bbox(lat, lng):
        return None
    if not goseong_in_text(_doc_blob(d)):
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
    if lat is None or lng is None or not in_goseong_bbox(lat, lng):
        return None
    if not goseong_in_text(_doc_blob(d)):
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


def geocode_query_variants(addr_raw: str, name: str, sheet_myeon: str) -> list[str]:
    tail = goseong_tail(addr_raw, sheet_myeon)
    out: list[str] = []
    seen: set[str] = set()

    def push(q: str) -> None:
        t = collapse(q)
        if t and t not in seen:
            seen.add(t)
            out.append(t)

    norm = normalize_addr(addr_raw, sheet_myeon)
    push(norm)
    if is_likely_jibeon(tail):
        for tv in lot_query_variants(tail):
            push(f"경상남도 고성군 {tv}")
            push(f"경남 고성군 {tv}")
    else:
        for base in road_format_variants(tail):
            push(f"경상남도 고성군 {base}")
            push(f"경남 고성군 {base}")
            road_only = re.sub(r"\s+\d+(?:-\d+)?\s*$", "", base).strip()
            if road_only and road_only != base:
                push(f"경상남도 고성군 {road_only}")
    push(f"{name} 고성군")
    push(f"{name} 경남 고성")
    compact = re.sub(r"\s+", "", name)
    if compact != name:
        push(f"{compact} 경남 고성군")
    m = re.search(r"([가-힣]+리)", tail)
    if m:
        push(f"경남 고성군 {m.group(1)}")
    return out


def area_fallback(addr_raw: str, sheet_myeon: str, key: str, display: str) -> GeoHit | None:
    norm = normalize_addr(addr_raw, sheet_myeon)
    m = AREA_RE.search(norm)
    area = m.group(1) if m else ""
    if not area and sheet_myeon.endswith(("읍", "면")):
        area = sheet_myeon
    if not area:
        return None
    for q in (f"경상남도 고성군 {area}", f"경남 고성군 {area}"):
        for d in kakao_get(GEOCODE_URL, q, key):
            hit = parse_address_doc(d, key)
            if hit:
                hit.road = display
                cj, _ = coord2address(hit.lng, hit.lat, key)
                hit.jibeon = cj or display
                return hit
    return None


def resolve_geocode(addr_raw: str, name: str, sheet_myeon: str, key: str) -> GeoHit | None:
    display = normalize_addr(addr_raw, sheet_myeon)
    for q in geocode_query_variants(addr_raw, name, sheet_myeon):
        for d in kakao_get(GEOCODE_URL, q, key):
            hit = parse_address_doc(d, key)
            if hit:
                return hit
        for d in kakao_get(KEYWORD_URL, q, key):
            hit = parse_keyword_doc(d, key)
            if hit:
                return hit
    return area_fallback(addr_raw, sheet_myeon, key, display)


@dataclass
class GoseongRow:
    name: str
    addr_raw: str
    sheet_myeon: str


def iter_rows(path: Path) -> list[GoseongRow]:
    wb = xlrd.open_workbook(path)
    out: list[GoseongRow] = []
    for sheet_name in wb.sheet_names():
        if sheet_name in SKIP_SHEETS:
            continue
        sh = wb.sheet_by_name(sheet_name)
        myeon = sheet_name if sheet_name.endswith(("읍", "면")) else ""
        start_row = 0
        for r in range(sh.nrows):
            if cell_str(sh.cell_value(r, 0)) == "상호명":
                start_row = r + 1
                break
        if start_row == 0:
            start_row = 2
        for r in range(start_row, sh.nrows):
            name = cell_str(sh.cell_value(r, 0))
            addr = cell_str(sh.cell_value(r, 1)) if sh.ncols > 1 else ""
            note = cell_str(sh.cell_value(r, 2)) if sh.ncols > 2 else ""
            if is_summary_row(name, addr):
                continue
            if is_closed(note, name):
                continue
            out.append(GoseongRow(name=name, addr_raw=addr, sheet_myeon=myeon))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    ap.add_argument("--skip-kakao", action="store_true")
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--skip-activity", action="store_true")
    args = ap.parse_args()
    inp = args.input.expanduser()
    if not inp.is_file():
        raise SystemExit(f"파일 없음: {inp}")

    key = load_kakao_key()
    allow_geo = not args.skip_kakao and bool(key)
    if not args.skip_kakao and not key:
        raise SystemExit("KAKAO_REST_API_KEY 필요 (frontend/.env.local)")

    rows = iter_rows(inp)
    cache = {} if args.refresh else load_cache()
    out: list[dict] = []
    seen: set[str] = set()
    geo_n = 0
    misses = 0

    for row in rows:
        display = normalize_addr(row.addr_raw, row.sheet_myeon)
        dk = f"{row.name}|{display}"
        if dk in seen:
            continue
        seen.add(dk)

        ck = cache_key(row.name, row.addr_raw)
        if ck in cache and not args.refresh:
            lat, lng, road, jibeon = cache[ck]
            geo_n += 1
        elif allow_geo:
            hit = resolve_geocode(row.addr_raw, row.name, row.sheet_myeon, key)  # type: ignore[arg-type]
            if not hit:
                print(f"[지오코딩 실패] {row.name}\t{display}", file=sys.stderr)
                misses += 1
                continue
            lat, lng, road, jibeon = hit.lat, hit.lng, hit.road, hit.jibeon
            cache[ck] = [lat, lng, road, jibeon]
            geo_n += 1
            if geo_n % 50 == 0:
                save_cache(cache)
                print(f"[geocode] {geo_n} …", file=sys.stderr)
        else:
            misses += 1
            continue

        if not in_goseong_bbox(lat, lng):
            print(f"[좌표 제외] {row.name}\t{display}", file=sys.stderr)
            misses += 1
            continue

        rid = hashlib.sha1(f"{row.name}\n{road}".encode()).hexdigest()[:20]
        out.append(
            {
                "id": f"gyeongnam-goseong-trash-{rid}",
                "name": row.name,
                "lat": round(lat, 7),
                "lng": round(lng, 7),
                "roadAddress": road,
                "address": jibeon,
                "businessStatus": "영업",
                "hasTrashBag": True,
                "hasSpecialBag": False,
                "hasLargeWasteSticker": False,
                "adminVerified": True,
                "dataReferenceDate": REF_DATE,
            }
        )

    save_cache(cache)
    out.sort(key=lambda x: (x["name"], x["roadAddress"]))
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(
        f"wrote {len(out)} → {OUT_JSON} "
        f"(ref={REF_DATE}, geo={geo_n}, miss={misses}, src={len(rows)})"
    )

    if out and not args.skip_activity:
        sys.path.insert(0, str(SCRIPT_DIR))
        from append_activity import record_region_data_added

        record_region_data_added(["고성군"])


if __name__ == "__main__":
    main()
