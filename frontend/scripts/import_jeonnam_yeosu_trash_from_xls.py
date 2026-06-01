#!/usr/bin/env python3
"""
여수시 종량제봉투·특수마대(불연성마대) 판매소 .xls → stores.jeonnam-yeosu-trash.json

입력 열(시트 '여수시', 4행부터):
  연번, 판매소명, 판매소 주소, 판매소 전화번호,
  종량제봉투 판매 여부(O/X), 특수마대 판매 여부(O/X), 기타 참고사항

  python3 scripts/import_jeonnam_yeosu_trash_from_xls.py \\
    --input ~/Downloads/여수시_정보공개청구(종량제봉투\\ 판매소\\ 현황).xls

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
    print("xlrd 필요: pip install 'xlrd==1.2.0'", file=sys.stderr)
    raise SystemExit(1) from e

FRONTEND = Path(__file__).resolve().parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.jeonnam-yeosu-trash.json"
CACHE_PATH = SCRIPT_DIR / "geocode-cache-jeonnam-yeosu-trash.json"
DL = Path.home() / "Downloads"
DEFAULT_INPUT = DL / "여수시_정보공개청구(종량제봉투 판매소 현황).xls"
REF_DATE = date.today().isoformat()
CACHE_VERSION = "v2-yeosu-xls"

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
COORD2_URL = "https://dapi.kakao.com/v2/local/geo/coord2address.json"
GEOCODE_DELAY = 0.06

WS_RE = re.compile(r"[ \t\r\n\v\f]+")
_REF_HEADER = re.compile(r"\(?\s*(\d{4})\s*\.\s*(\d{1,2})\s*\.?\s*기준\s*\)?")
_REF_FILENAME = re.compile(r"(\d{4})\s*[\.\-]\s*(\d{1,2})")


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


def ref_date_from_workbook(sh: xlrd.sheet.Sheet, path: Path) -> str:
    for r in range(min(3, sh.nrows)):
        for c in range(sh.ncols):
            m = _REF_HEADER.search(collapse(str(sh.cell_value(r, c))))
            if m:
                y, mo = m.groups()
                return f"{y}-{int(mo):02d}-01"
    m = _REF_FILENAME.search(path.name)
    if m:
        y, mo = m.groups()
        return f"{y}-{int(mo):02d}-01"
    return REF_DATE


def in_yeosu_bbox(lat: float, lng: float) -> bool:
    return 34.0 <= lat <= 34.95 and 127.2 <= lng <= 127.95


def yeosu_in_text(blob: str) -> bool:
    return "여수" in (blob or "").replace(" ", "")


def format_display_addr(raw: str) -> str:
    a = collapse(raw)
    a = re.sub(r"^전남\s+", "전라남도 ", a)
    if not a:
        return ""
    if a.startswith("전라남도"):
        return a
    if a.startswith("여수시"):
        return f"전라남도 {a}"
    return f"전라남도 여수시 {a}"


def _addr_core_for_geocode(addr_raw: str) -> str:
    """지오코딩용: 층·호·쉼표 뒤 상세는 제거."""
    a = collapse(addr_raw)
    if "," in a:
        a = a.split(",")[0].strip()
    a = re.sub(r"\s*번지\s*", " ", a)
    a = re.sub(r"\s+\d+\s*층\s*", " ", a)
    a = re.sub(r"\s+\d+\s*호.*$", "", a)
    # 도로명+번지 붙은 형태: 관문1길14 → 관문1길 14
    m = re.match(r"^(.+?[로길대로])(\d[\d\-]*)$", a.replace(" ", ""))
    if m:
        a = f"{m.group(1)} {m.group(2)}"
    return collapse(a)


def normalize_addr(addr_raw: str) -> str:
    return format_display_addr(_addr_core_for_geocode(addr_raw))


def ox_cell(v: object) -> bool:
    return str(v or "").strip().upper() == "O"


def normalize_phone(v: object) -> str:
    if v is None or v == "":
        return ""
    if isinstance(v, float) and v == int(v):
        s = str(int(v))
    else:
        s = collapse(str(v))
    s = re.sub(r"[^\d\-]", "", s)
    return s


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
    if lat is None or lng is None or not in_yeosu_bbox(lat, lng):
        return None
    if not yeosu_in_text(_doc_blob(d)):
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
    if lat is None or lng is None or not in_yeosu_bbox(lat, lng):
        return None
    if not yeosu_in_text(_doc_blob(d)):
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


def geocode_query_variants(addr_raw: str, name: str) -> list[str]:
    core = _addr_core_for_geocode(addr_raw)
    norm = normalize_addr(addr_raw)
    tail = norm
    for prefix in ("전라남도 여수시 ", "전라남도 ", "여수시 "):
        if tail.startswith(prefix):
            tail = collapse(tail[len(prefix) :])
            break
    out: list[str] = []
    seen: set[str] = set()

    def push(q: str) -> None:
        t = collapse(q)
        if t and t not in seen:
            seen.add(t)
            out.append(t)

    push(norm)
    push(format_display_addr(core))
    push(f"전남 여수시 {_addr_core_for_geocode(addr_raw)}")
    push(f"전남 여수시 {tail}")
    push(f"전라남도 여수시 {tail}")
    road_only = re.sub(r"\s+\d+(?:-\d+)?\s*$", "", tail).strip()
    if road_only and road_only != tail:
        push(f"전라남도 여수시 {road_only}")
    push(f"{name} 여수")
    push(f"{name} 여수시")
    return out


def resolve_geocode(addr_raw: str, name: str, key: str) -> GeoHit | None:
    for q in geocode_query_variants(addr_raw, name):
        for d in kakao_get(GEOCODE_URL, q, key):
            hit = parse_address_doc(d, key)
            if hit:
                return hit
        for d in kakao_get(KEYWORD_URL, q, key):
            hit = parse_keyword_doc(d, key)
            if hit:
                return hit
    return None


@dataclass
class YeosuRow:
    name: str
    addr_raw: str
    phone: str
    has_trash: bool
    has_special: bool
    note: str


def iter_rows(path: Path) -> tuple[list[YeosuRow], str]:
    wb = xlrd.open_workbook(str(path))
    sh = wb.sheet_by_index(0)
    ref = ref_date_from_workbook(sh, path)
    out: list[YeosuRow] = []
    for r in range(3, sh.nrows):
        name = collapse(str(sh.cell_value(r, 2)))
        addr = collapse(str(sh.cell_value(r, 3)))
        phone = normalize_phone(sh.cell_value(r, 4))
        has_trash = ox_cell(sh.cell_value(r, 5))
        has_special = ox_cell(sh.cell_value(r, 6))
        note = collapse(str(sh.cell_value(r, 7)))
        if not name:
            continue
        if not addr:
            continue
        if not has_trash and not has_special:
            continue
        out.append(
            YeosuRow(
                name=name,
                addr_raw=addr,
                phone=phone,
                has_trash=has_trash,
                has_special=has_special,
                note=note,
            )
        )
    return out, ref


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

    rows, path_ref = iter_rows(inp)
    cache = {} if args.refresh else load_cache()
    out: list[dict] = []
    seen: set[str] = set()
    geo_n = 0
    misses = 0

    for row in rows:
        display = normalize_addr(row.addr_raw)
        dk = f"{row.name}|{display}"
        if dk in seen:
            continue
        seen.add(dk)

        lat: float | None = None
        lng: float | None = None
        road = display
        jibeon = display

        ck = cache_key(row.name, row.addr_raw)
        if ck in cache and not args.refresh:
            lat, lng, road, jibeon = cache[ck]
            geo_n += 1
        elif allow_geo:
            hit = resolve_geocode(row.addr_raw, row.name, key)  # type: ignore[arg-type]
            if hit:
                lat, lng, road, jibeon = hit.lat, hit.lng, hit.road, hit.jibeon
                cache[ck] = [lat, lng, road, jibeon]
                geo_n += 1
            else:
                print(f"[지오코딩 실패] {row.name}\t{display}", file=sys.stderr)
                misses += 1
                continue
        else:
            misses += 1
            continue

        if lat is None or lng is None or not in_yeosu_bbox(lat, lng):
            print(f"[좌표 제외] {row.name}\t{display}", file=sys.stderr)
            misses += 1
            continue

        rid = hashlib.sha1(f"{row.name}\n{road}".encode()).hexdigest()[:20]
        item: dict = {
            "id": f"jeonnam-yeosu-trash-{rid}",
            "name": row.name,
            "lat": round(lat, 7),
            "lng": round(lng, 7),
            "roadAddress": road,
            "address": jibeon,
            "businessStatus": "영업",
            "hasTrashBag": row.has_trash,
            "hasSpecialBag": row.has_special,
            "hasLargeWasteSticker": False,
            "adminVerified": True,
            "dataReferenceDate": path_ref,
        }
        if row.phone:
            item["phone"] = row.phone
        out.append(item)

    out.sort(key=lambda x: (x["name"], x["roadAddress"]))
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if allow_geo:
        save_cache(cache)

    trash_n = sum(1 for x in out if x["hasTrashBag"])
    special_n = sum(1 for x in out if x["hasSpecialBag"])
    print(
        f"wrote {len(out)} → {OUT_JSON} "
        f"(ref={path_ref}, 종량제 {trash_n}, 특수마대 {special_n}, "
        f"geo_cache={geo_n}, miss={misses}, src_rows={len(rows)})"
    )

    if out and not args.skip_activity:
        sys.path.insert(0, str(SCRIPT_DIR))
        from append_activity import record_region_data_added

        record_region_data_added(["여수시"])


if __name__ == "__main__":
    main()
