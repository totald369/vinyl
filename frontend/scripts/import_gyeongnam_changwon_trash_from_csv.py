#!/usr/bin/env python3
"""
경상남도 창원시 종량제봉투 지정판매소 CSV → stores.gyeongnam-changwon-trash.json

입력: 판매소명, 사업장 주소 (cp949/euc-kr CSV)

  pip install xlrd  # 불필요 — 표준 csv 사용
  python3 scripts/import_gyeongnam_changwon_trash_from_csv.py \\
    --input ~/Downloads/창원시설공단_창원시\\ 종량제봉투\\ 지정판매소\\ 현황_20240205.CSV

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
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.gyeongnam-changwon-trash.json"
CACHE_PATH = SCRIPT_DIR / "geocode-cache-gyeongnam-changwon-trash.json"
DL = Path.home() / "Downloads"
DEFAULT_INPUT = DL / "창원시설공단_창원시 종량제봉투 지정판매소 현황_20240205.CSV"
REF_DATE = "2024-02-05"
CACHE_VERSION = "v1"

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
COORD2_URL = "https://dapi.kakao.com/v2/local/geo/coord2address.json"
GEOCODE_DELAY = 0.06

WS_RE = re.compile(r"[ \t\r\n\v\f]+")
GU_RE = re.compile(r"^(?:경상남도\s+)?(?:창원시\s+)?(의창구|성산구|진해구|마산합포구|마산회원구|마산화원구)")
GU_NAMES = ("의창구", "성산구", "진해구", "마산합포구", "마산회원구", "마산화원구")
LOT_RE = re.compile(r"^(?P<prefix>.*?)(?P<main>\d+)(?:-(?P<sub>\d+))?\s*$")
ROAD_RE = re.compile(r"(로|길|대로)\s*(\d+)")
GU_ALIASES = {"마산화원구": "마산회원구"}
# 원본 CSV 오기(의창구 용호동 → 실제 성산구)
DONG_GU_OVERRIDES: dict[str, str] = {"용호동": "성산구"}


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


def in_changwon_bbox(lat: float, lng: float) -> bool:
    # 진전·진북 면 등 서부 포함
    return 35.05 <= lat <= 35.38 and 128.40 <= lng <= 128.86


def changwon_in_text(blob: str) -> bool:
    b = (blob or "").replace(" ", "")
    return "창원" in b or "마산" in b or "진해" in b


def format_display_addr(raw: str) -> str:
    a = collapse(raw)
    a = re.sub(r"^경남\s+", "경상남도 ", a)
    if a.startswith("경상남도"):
        return a
    if changwon_in_text(a):
        if a.startswith("창원시"):
            return f"경상남도 {a}"
        for gu in GU_NAMES:
            if a.startswith(gu):
                gu_fix = GU_ALIASES.get(gu, gu)
                return f"경상남도 창원시 {gu_fix} {a[len(gu):].lstrip()}"
        return f"경상남도 창원시 {a}"
    return a


def normalize_changwon_addr(addr: str) -> str:
    a = collapse(addr)
    if not a or a in ("대원",):
        return ""
    if re.search(r"서울|부산광역|대구광역|인천광역|광주광역|대전광역|울산광역|세종", a.replace(" ", "")):
        if "창원" not in a.replace(" ", ""):
            return ""
    a = re.sub(r",\s*.*$", "", a)
    a = re.sub(r"\s*\([^)]*$", " ", a)
    a = re.sub(r"\s*\([^)]*\)\s*", " ", a)
    a = re.sub(r"\s*번지\s*", " ", a)
    a = re.sub(r"\s+\d+\s*층\s*", " ", a)
    a = re.sub(r"\s+\d+\s*호\s*", " ", a)
    a = re.sub(r"^경남\s+", "경상남도 ", a)
    a = re.sub(r"(\d+)\s+(\d+)\s*$", r"\1-\2", a)
    a = re.sub(r"외\s*\d+\s*필지", "", a)
    a = re.sub(r"\s+\d+동\s+\d+\s*호\s*$", "", a)
    a = re.sub(r"(\d+(?:-\d+)?)\s+[가-힣][가-힣\s\d]*$", r"\1", a)
    if not a.startswith("경상") and changwon_in_text(a):
        if a.startswith("창원시"):
            return collapse(f"경상남도 {a}")
        for gu in GU_NAMES:
            if a.startswith(gu):
                gu_fix = GU_ALIASES.get(gu, gu)
                return collapse(f"경상남도 창원시 {gu_fix} {a[len(gu):].lstrip()}")
        return collapse(f"경상남도 창원시 {a}")
    for gu, alias in GU_ALIASES.items():
        a = a.replace(gu, alias)
    return collapse(a)


def build_dong_gu_map(rows: list[tuple[str, str]]) -> dict[str, str]:
    counts: dict[str, Counter[str]] = defaultdict(Counter)
    for _, addr in rows:
        m = re.search(r"창원시\s+(\S+구)\s+(\S+?(?:동|읍|면|리))\b", addr)
        if m:
            gu = GU_ALIASES.get(m.group(1), m.group(1))
            counts[m.group(2)][gu] += 1
    return {dong: c.most_common(1)[0][0] for dong, c in counts.items()}


def infer_gu(addr: str, dong_gu: dict[str, str]) -> str | None:
    m = GU_RE.match(addr)
    if m:
        return GU_ALIASES.get(m.group(1), m.group(1))
    dm = re.match(r"^([가-힣]+(?:동|읍|면|리))\b", addr)
    if dm and dm.group(1) in dong_gu:
        return dong_gu[dm.group(1)]
    return None


def complete_addr(addr: str, dong_gu: dict[str, str]) -> str:
    a = normalize_changwon_addr(addr)
    if not a:
        return ""
    if re.search(r"창원시\s+\S+구", a):
        return a
    gu = infer_gu(addr, dong_gu)
    if gu and not re.search(r"창원시\s+\S+구", a):
        tail = addr.strip()
        for g in GU_NAMES:
            if tail.startswith(g):
                tail = tail[len(g) :].lstrip()
                break
        dm = re.match(r"^([가-힣]+(?:동|읍|면|리))\b", tail)
        if dm:
            return normalize_changwon_addr(f"경상남도 창원시 {gu} {tail}")
        return normalize_changwon_addr(f"경상남도 창원시 {gu} {tail}")
    return a


def changwon_tail(norm: str) -> str:
    for prefix in (
        "경상남도 창원시 ",
        "경상남도 ",
        "경남 창원시 ",
        "창원시 ",
    ):
        if norm.startswith(prefix):
            return collapse(norm[len(prefix) :])
    return norm


def is_likely_jibeon(tail: str) -> bool:
    if ROAD_RE.search(tail):
        return False
    return bool(re.search(r"\d", tail))


def lot_bunji_ho_as_dash(lot: str) -> str | None:
    m = re.search(r"([가-힣]+(?:리|동|읍|면|가))\s+(\d+)\s*번지\s*(\d+)\s*호", lot)
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
    if "번지" in tail:
        i = tail.find("번지")
        push(tail[:i].strip())
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


def addr_gu_fix_variants(full: str) -> list[str]:
    out = [full]
    seen = {full}
    for dong, gu in DONG_GU_OVERRIDES.items():
        for wrong_gu in GU_NAMES:
            if wrong_gu == gu:
                continue
            token = f"{wrong_gu} {dong}"
            if token in full:
                fixed = full.replace(token, f"{gu} {dong}")
                if fixed not in seen:
                    seen.add(fixed)
                    out.append(fixed)
    return out


def geocode_query_variants(addr: str, name: str, dong_gu: dict[str, str]) -> list[str]:
    full = complete_addr(addr, dong_gu)
    out: list[str] = []
    seen: set[str] = set()

    def push_q(q: str) -> None:
        t = collapse(q)
        if t and t not in seen:
            seen.add(t)
            out.append(t)

    for variant in addr_gu_fix_variants(full):
        tail = changwon_tail(variant)
        if is_likely_jibeon(tail):
            for tv in lot_query_variants(tail):
                push_q(f"경남 창원시 {tv}")
                push_q(f"경상남도 창원시 {tv}")
        else:
            push_q(f"경남 창원시 {tail}")
            push_q(f"경상남도 창원시 {tail}")
            push_q(variant)
            if re.search(r"-\d+\s*$", tail):
                rt_base = re.sub(r"-\d+\s*$", "", tail).strip()
                push_q(f"경남 창원시 {rt_base}")
            road_only = re.sub(r"\s+\d+(?:-\d+)?\s*$", "", tail).strip()
            if road_only and road_only != tail:
                push_q(f"경남 창원시 {road_only}")

    push_q(f"{name} 창원")
    push_q(f"{name} 창원시")
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
    if lat is None or lng is None or not in_changwon_bbox(lat, lng):
        return None
    if not changwon_in_text(_doc_blob(d)):
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
    if lat is None or lng is None or not in_changwon_bbox(lat, lng):
        return None
    if not changwon_in_text(_doc_blob(d)):
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


def extract_area(tail: str) -> str | None:
    compact = tail.replace(" ", "")
    m = re.match(r"^((?:의창|성산|진해|마산합포|마산회원)구)", compact)
    if m:
        gu = GU_ALIASES.get(m.group(1), m.group(1))
        rest = compact[len(m.group(1)) :]
        m2 = re.match(r"^(.+?(?:동|읍|면|리|가))", rest)
        if m2:
            return collapse(f"{gu} {m2.group(1)}")
        return gu
    m = re.match(r"^(.+?(?:동|읍|면|리|가))", compact)
    if m:
        return collapse(m.group(1))
    return None


def area_fallback(addr: str, key: str, orig_jibeon: str, dong_gu: dict[str, str]) -> GeoHit | None:
    full = complete_addr(addr, dong_gu)
    tail = changwon_tail(full)
    area = extract_area(tail)
    if not area:
        gu = infer_gu(addr, dong_gu)
        if gu:
            area = gu
    if not area:
        return None
    for q in (f"경남 창원시 {area}", f"경상남도 창원시 {area}"):
        for d in kakao_get(GEOCODE_URL, q, key):
            hit = parse_address_doc(d, key)
            if hit:
                hit.jibeon = orig_jibeon or hit.jibeon
                cj, cr = coord2address(hit.lng, hit.lat, key)
                if not hit.road or hit.road == hit.jibeon:
                    hit.road = cr or hit.road
                return hit
    return None


def resolve_geocode(addr: str, name: str, key: str, dong_gu: dict[str, str]) -> GeoHit | None:
    orig = complete_addr(addr, dong_gu)
    if not orig:
        return None
    for q in geocode_query_variants(addr, name, dong_gu):
        for d in kakao_get(GEOCODE_URL, q, key):
            hit = parse_address_doc(d, key)
            if hit:
                hit.jibeon = orig
                return hit
        for d in kakao_get(KEYWORD_URL, q, key):
            hit = parse_keyword_doc(d, key)
            if hit:
                hit.jibeon = orig
                return hit
    return area_fallback(addr, key, orig, dong_gu)


def cache_key(name: str, addr: str) -> str:
    return hashlib.sha1(f"{CACHE_VERSION}:{name}:{addr}".encode()).hexdigest()[:28]


def read_csv_rows(path: Path) -> list[tuple[str, str]]:
    text = decode_csv(path.read_bytes())
    reader = csv.reader(text.splitlines())
    header = next(reader, None)
    if not header:
        return []
    rows: list[tuple[str, str]] = []
    for r in reader:
        if len(r) < 2:
            continue
        name = collapse(r[0])
        addr = collapse(r[1])
        if name and addr:
            rows.append((name, addr))
    return rows


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

    raw_rows = read_csv_rows(inp)
    dong_gu = build_dong_gu_map(raw_rows)
    cache = {} if args.refresh else load_cache()
    out: list[dict] = []
    geo_n = 0
    fallback_n = 0
    misses = 0
    seen: set[str] = set()

    for name, addr_raw in raw_rows:
        dk = f"{name}|{addr_raw}"
        if dk in seen:
            continue
        seen.add(dk)

        jibeon = complete_addr(addr_raw, dong_gu)
        if not jibeon or "창원" not in jibeon.replace(" ", ""):
            continue

        ck = cache_key(name, jibeon)
        hit: GeoHit | None = None

        if not args.refresh and ck in cache:
            raw = cache[ck]
            if isinstance(raw, list) and len(raw) >= 2:
                lat, lng = float(raw[0]), float(raw[1])
                road = str(raw[2]) if len(raw) > 2 else ""
                jib = str(raw[3]) if len(raw) > 3 else jibeon
                if not road or not jib:
                    cj, cr = coord2address(lng, lat, key)
                    jib = jib or cj or jibeon
                    road = road or cr or jibeon
                hit = GeoHit(lat=lat, lng=lng, road=road, jibeon=jib)

        if hit is None and allow:
            hit = resolve_geocode(addr_raw, name, key, dong_gu)
            if hit is None:
                misses += 1
                print(f"[geocode 실패] {name}\t{jibeon}", file=sys.stderr)
                continue
            if hit.jibeon == jibeon and not re.search(r"\d", jibeon):
                fallback_n += 1
            cache[ck] = [hit.lat, hit.lng, hit.road, hit.jibeon]
            geo_n += 1
            if geo_n % 100 == 0:
                save_cache(cache)
                print(f"[geocode] {geo_n} …", file=sys.stderr)
            time.sleep(GEOCODE_DELAY)
        elif hit is None:
            misses += 1
            continue

        rid = hashlib.sha1(f"{name}\n{jibeon}".encode()).hexdigest()[:20]
        out.append(
            {
                "id": f"gyeongnam-changwon-trash-{rid}",
                "name": name,
                "lat": round(float(hit.lat), 7),
                "lng": round(float(hit.lng), 7),
                "roadAddress": hit.road or jibeon,
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
    out.sort(key=lambda x: (x["name"], x["address"]))
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"wrote {len(out)} → {OUT_JSON} "
        f"(ref_date={REF_DATE}, api≈{geo_n}, fallback≈{fallback_n}, miss={misses})"
    )


if __name__ == "__main__":
    main()
