#!/usr/bin/env python3
"""
경상북도 경주시 관급(종량제) 봉투 판매업소.xls → stores.gyeongbuk-gyeongju-trash.json

시트: 상호 | 사업장주소(지번) | 판매소위치(도로명) | 판매소위치(지번)

  pip install xlrd
  python3 scripts/import_gyeongbuk_gyeongju_trash_from_xls.py \\
    --input ~/Downloads/관급봉투판매업소현황\\(25.7.21.\\).xls

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
from pathlib import Path

import xlrd

FRONTEND = Path(__file__).resolve().parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.gyeongbuk-gyeongju-trash.json"
CACHE_PATH = SCRIPT_DIR / "geocode-cache-gyeongbuk-gyeongju-trash.json"
DL = Path.home() / "Downloads"
DEFAULT_INPUT = DL / "관급봉투판매업소현황(25.7.21.).xls"
CACHE_VERSION = "v1"

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
COORD2_URL = "https://dapi.kakao.com/v2/local/geo/coord2address.json"
GEOCODE_DELAY = 0.07

WS_RE = re.compile(r"[ \t\r\n\v\f]+")
_REF_FILENAME = re.compile(r"\(?\s*(\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?\s*\)?")
LOT_RE = re.compile(r"^(?P<prefix>.*?)(?P<main>\d+)(?:-(?P<sub>\d+))?\s*$")
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


def cell_str(sh: xlrd.sheet.Sheet, r: int, c: int) -> str:
    v = sh.cell_value(r, c)
    if v is None or v == "":
        return ""
    if isinstance(v, float):
        if v == int(v):
            return str(int(v))
        return str(v)
    return str(v).strip()


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
        yy, mo, day = m.groups()
        year = 2000 + int(yy) if len(yy) == 2 else int(yy)
        return f"{year:04d}-{int(mo):02d}-{int(day):02d}"
    return "2025-07-21"


def in_gyeongju_bbox(lat: float, lng: float) -> bool:
    # 양남·외동 남부 + 감포 해안 포함
    return 35.64 <= lat <= 36.08 and 128.96 <= lng <= 129.55


def gyeongju_in_text(blob: str) -> bool:
    return "경주" in (blob or "").replace(" ", "")


def format_display_addr(raw: str) -> str:
    a = collapse(raw)
    a = re.sub(r"^경북\s+", "경상북도 ", a)
    if not a.startswith("경상") and "경주" in a.replace(" ", ""):
        if a.startswith("경주시"):
            return f"경상북도 {a}"
        return f"경상북도 경주시 {a}"
    return a


def normalize_gyeongju_addr(addr: str) -> str:
    a = collapse(addr)
    a = re.sub(r",\s*.*$", "", a)
    a = re.sub(r"\s*\([^)]*\)\s*", " ", a)
    a = re.sub(r"\s*번지\s*", " ", a)
    a = re.sub(r"\s+\d+\s*호\s*", " ", a)
    a = re.sub(r"^경북\s+", "경상북도 ", a)
    a = re.sub(r"^경상\s+", "경상북도 ", a)
    if a.startswith("경상북도경주"):
        a = a.replace("경상북도경주", "경상북도 경주", 1)
    a = re.sub(r"(\d+)\s+(\d+)\s*$", r"\1-\2", a)
    if not a.startswith("경상") and "경주" in a.replace(" ", ""):
        if a.startswith("경주시"):
            return f"경상북도 {a}"
        return f"경상북도 경주시 {a}"
    return collapse(a)


def gyeongju_tail(addr: str) -> str:
    norm = normalize_gyeongju_addr(addr)
    for prefix in (
        "경상북도 경주시 ",
        "경상북도경주시",
        "경상북도 ",
        "경북 경주시 ",
        "경주시 ",
    ):
        if norm.startswith(prefix):
            return collapse(norm[len(prefix) :])
    if norm.startswith("경상북도"):
        return collapse(norm.replace("경상북도", "", 1))
    return norm


def is_likely_jibeon(tail: str) -> bool:
    if ROAD_RE.search(tail):
        return False
    return bool(re.search(r"\d", tail))


def lot_bunji_ho_as_dash(lot: str) -> str | None:
    lot = normalize_gyeongju_addr(lot)
    m = re.search(r"([가-힣]+(?:리|동|가))\s+(\d+)\s*번지\s*(\d+)\s*호", lot)
    if not m:
        return None
    return collapse(lot[: m.start()] + f"{m.group(1)} {m.group(2)}-{m.group(3)}" + lot[m.end() :])


def lot_query_variants(tail: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()

    def push(s: str) -> None:
        t = collapse(s)
        if t and t not in seen:
            seen.add(t)
            out.append(t)

    push(tail)
    dash = lot_bunji_ho_as_dash(tail)
    if dash:
        push(dash)
    if " 외 " in tail:
        push(re.sub(r"\s+외\s+.*$", "", tail).strip())
    if "번지" in tail:
        i = tail.find("번지")
        push(tail[: i + len("번지")].strip())
        push(tail[:i].strip())
        push(re.sub(r"\s*번지\s*", " ", tail).strip())
    m = LOT_RE.match(tail)
    if m:
        prefix, main, sub = m.group("prefix"), m.group("main"), m.group("sub")
        subs: list[str | None] = [sub, "1", "2", "3", "4", "5"] if sub else [None]
        for s in subs:
            if s is None:
                push(f"{prefix}{main}")
            else:
                push(f"{prefix}{main}-{s}")
    return out


def resolve_jibeon(biz: str, lot: str) -> str:
    biz_n = normalize_gyeongju_addr(biz)
    lot_n = normalize_gyeongju_addr(lot)
    if lot_n and re.search(r"\d", lot_n):
        return format_display_addr(lot_n)
    if biz_n and re.search(r"\d", biz_n):
        return format_display_addr(biz_n)
    if biz_n:
        return format_display_addr(biz_n)
    if lot_n:
        return format_display_addr(lot_n)
    return ""


def geocode_query_variants(road: str, jibeon: str, name: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()

    def push_q(q: str) -> None:
        t = collapse(q)
        if t and t not in seen:
            seen.add(t)
            out.append(t)

    road_n = normalize_gyeongju_addr(road)
    jib_n = normalize_gyeongju_addr(jibeon)

    if road_n:
        rt = gyeongju_tail(road_n)
        push_q(f"경북 경주시 {rt}")
        push_q(f"경상북도 경주시 {rt}")
        push_q(road_n)
        if re.search(r"-\d+\s*$", rt):
            rt_base = re.sub(r"-\d+\s*$", "", rt).strip()
            push_q(f"경북 경주시 {rt_base}")

    if jib_n:
        jt = gyeongju_tail(jib_n)
        if is_likely_jibeon(jt):
            for tv in lot_query_variants(jt):
                push_q(f"경북 경주시 {tv}")
                push_q(f"경상북도 경주시 {tv}")
        else:
            push_q(f"경북 경주시 {jt}")
            push_q(jib_n)

    push_q(f"{name} 경주시")
    push_q(f"{name} 경주")
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
    if lat is None or lng is None or not in_gyeongju_bbox(lat, lng):
        return None
    if not gyeongju_in_text(_doc_blob(d)):
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
    if lat is None or lng is None or not in_gyeongju_bbox(lat, lng):
        return None
    if not gyeongju_in_text(_doc_blob(d)):
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


DONG_ALIASES: dict[str, str] = {
    "양북면": "문무대왕면",
}


def extract_area(tail: str) -> str | None:
    m = re.match(r"^(.+?(?:동|읍|면|리|가))", tail.replace(" ", ""))
    if not m:
        return None
    area = collapse(m.group(1))
    return DONG_ALIASES.get(area, area)


def area_fallback(addr_raw: str, key: str, orig_jibeon: str) -> GeoHit | None:
    tail = gyeongju_tail(addr_raw)
    area = extract_area(tail)
    if not area:
        return None
    for q in (f"경북 경주시 {area}", f"경상북도 경주시 {area}"):
        for d in kakao_get(GEOCODE_URL, q, key):
            hit = parse_address_doc(d, key)
            if hit:
                hit.jibeon = orig_jibeon or hit.jibeon
                cj, cr = coord2address(hit.lng, hit.lat, key)
                if not hit.road or hit.road == hit.jibeon:
                    hit.road = cr or hit.road
                if not hit.jibeon:
                    hit.jibeon = cj or orig_jibeon
                return hit
    return None


def road_strip_fallback(road_raw: str, orig_jibeon: str, key: str) -> GeoHit | None:
    tail = gyeongju_tail(road_raw)
    if not tail or is_likely_jibeon(tail):
        return None
    road_only = re.sub(r"\s+\d+(?:-\d+)?\s*$", "", tail).strip()
    if not road_only or road_only == tail:
        road_only = re.sub(r"-\d+\s*$", "", tail).strip()
    if not road_only:
        return None
    for q in (f"경북 경주시 {road_only}", f"경상북도 경주시 {road_only}"):
        for d in kakao_get(GEOCODE_URL, q, key):
            hit = parse_address_doc(d, key)
            if hit:
                hit.jibeon = orig_jibeon or hit.jibeon
                hit.road = normalize_gyeongju_addr(road_raw) or hit.road
                return hit
    return None


def resolve_geocode(
    road: str, biz: str, lot: str, name: str, orig_jibeon: str, key: str
) -> GeoHit | None:
    for q in geocode_query_variants(road, orig_jibeon or resolve_jibeon(biz, lot), name):
        for d in kakao_get(GEOCODE_URL, q, key):
            hit = parse_address_doc(d, key)
            if hit:
                return hit
        for d in kakao_get(KEYWORD_URL, q, key):
            hit = parse_keyword_doc(d, key)
            if hit:
                return hit
    if road:
        hit = road_strip_fallback(road, orig_jibeon, key)
        if hit:
            return hit
    return area_fallback(orig_jibeon or biz or lot, key, orig_jibeon)


def cache_key(name: str, biz: str, road: str, lot: str) -> str:
    payload = f"{CACHE_VERSION}:{name}:{biz}:{road}:{lot}"
    return hashlib.sha1(payload.encode()).hexdigest()[:28]


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

    wb = xlrd.open_workbook(inp)
    sheet = wb.sheet_by_index(0)
    if sheet.nrows < 2 or "상호" not in cell_str(sheet, 0, 0):
        raise SystemExit("헤더(상호) 없음")

    i_name, i_biz, i_road, i_lot = 0, 1, 2, 3
    ref_date = ref_date_from_path(inp)
    cache = {} if args.refresh else load_cache()
    out: list[dict] = []
    geo_n = 0
    fallback_n = 0
    misses = 0
    seen: set[str] = set()

    for r in range(1, sheet.nrows):
        name = cell_str(sheet, r, i_name)
        biz = cell_str(sheet, r, i_biz)
        road = cell_str(sheet, r, i_road)
        lot = cell_str(sheet, r, i_lot)
        if not name:
            continue
        if not biz and not road and not lot:
            continue
        blob_chk = (biz + road + lot).replace(" ", "")
        if "경주" not in blob_chk:
            continue

        dk = f"{name}|{biz}|{road}|{lot}"
        if dk in seen:
            continue
        seen.add(dk)

        road_n = normalize_gyeongju_addr(road)
        jibeon = resolve_jibeon(biz, lot)
        if not road_n and not jibeon:
            continue

        ck = cache_key(name, biz, road, lot)
        hit: GeoHit | None = None

        if not args.refresh and ck in cache:
            raw = cache[ck]
            if isinstance(raw, list) and len(raw) >= 2:
                lat, lng = float(raw[0]), float(raw[1])
                stored_road = str(raw[2]) if len(raw) > 2 else ""
                stored_jib = str(raw[3]) if len(raw) > 3 else ""
                road_disp = stored_road or road_n
                jib_disp = stored_jib or jibeon
                if not road_disp or not jib_disp:
                    cj, cr = coord2address(lng, lat, key)
                    jib_disp = jib_disp or cj or jibeon
                    road_disp = road_disp or cr or road_n or jib_disp
                hit = GeoHit(lat=lat, lng=lng, road=road_disp, jibeon=jib_disp)

        if hit is None and allow:
            before = resolve_geocode(road, biz, lot, name, jibeon, key)
            hit = before
            if hit is None:
                misses += 1
                print(f"[geocode 실패] {name}\t{road_n or jibeon}", file=sys.stderr)
                continue
            if before and (not road_n or not re.search(r"\d", jibeon)):
                fallback_n += 1
            cache[ck] = [hit.lat, hit.lng, hit.road, hit.jibeon]
            geo_n += 1
            if geo_n % 50 == 0:
                save_cache(cache)
                print(f"[geocode] {geo_n} …", file=sys.stderr)
            time.sleep(GEOCODE_DELAY)
        elif hit is None:
            misses += 1
            continue

        display_road = road_n or hit.road
        display_jib = jibeon or hit.jibeon
        if road_n:
            display_road = road_n
        if jibeon:
            display_jib = jibeon
        elif hit.jibeon:
            display_jib = hit.jibeon

        rid = hashlib.sha1(f"{name}\n{display_road}\n{display_jib}".encode()).hexdigest()[:20]
        out.append(
            {
                "id": f"gyeongbuk-gyeongju-trash-{rid}",
                "name": name,
                "lat": round(float(hit.lat), 7),
                "lng": round(float(hit.lng), 7),
                "roadAddress": display_road or display_jib,
                "address": display_jib or display_road,
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
        f"(ref_date={ref_date}, api≈{geo_n}, fallback≈{fallback_n}, miss={misses})"
    )


if __name__ == "__main__":
    main()
