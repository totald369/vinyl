#!/usr/bin/env python3
"""
부산 동구 종량제봉투 판매소 엑셀(.xls) → stores.busan-donggu-trash.json
파싱: 연번 · 동명(빈칸 상속) · 상호 · 주소 · 전화 · 불연성 20L · 건설용 20L
- 전 행 종량제 판매소 → hasTrashBag=True
- 'O' 불연성 20L → hasSpecialBag=True
건설용 20L는 별도 제품이라 기존 스키마에 대응 필드 없음(무시).

필요: xlrd (<2), 카카오 KAKAO_REST_API_KEY 가 .env.local

  pip3 install 'xlrd<2'
  python3 scripts/import_busan_donggu_trash_from_xls.py \\
    --xls \"$HOME/Downloads/종량제봉투판매소현황\(전용마대표기\)\(1\).xls\"
"""

from __future__ import annotations

import argparse
import datetime
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

import xlrd

FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.busan-donggu-trash.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-busan-donggu-trash.json"

USER_AGENT = "Mozilla/5.0 (compatible; VinylMapImport/1.0; +https://github.com/totald369/vinyl)"
GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
GEOCODE_DELAY = 0.06


def _load_dotenv_local():
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
KAKAO_REST_KEY = (
    os.environ.get("KAKAO_REST_KEY", "").strip()
    or os.environ.get("KAKAO_REST_API_KEY", "").strip()
)


def to_float(val):
    if val is None:
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (ValueError, TypeError):
        return None


def load_cache():
    if CACHE_PATH.exists():
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(c):
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(c, f, ensure_ascii=False)


def kakao_keyword_geocode(query: str, cache: dict, key: str) -> tuple[float, float] | None:
    h = hashlib.sha256(("kw:" + query).encode("utf-8")).hexdigest()[:16]
    if h in cache:
        lat, lng = cache[h]
        return float(lat), float(lng)
    q2 = urllib.parse.urlencode({"query": query, "size": "1"})
    r = urllib.request.Request(
        f"{KEYWORD_URL}?{q2}", headers={"Authorization": f"KakaoAK {key}"}
    )
    try:
        with urllib.request.urlopen(r, timeout=12) as resp:
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


def kakao_geocode(address: str, cache: dict, key: str) -> tuple[float, float] | None:
    h = hashlib.sha256(address.encode("utf-8")).hexdigest()[:16]
    if h in cache:
        lat, lng = cache[h]
        return float(lat), float(lng)

    def req(url: str) -> tuple[float, float] | None:
        r = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {key}"})
        try:
            with urllib.request.urlopen(r, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                docs = data.get("documents", [])
                if docs:
                    lat = to_float(docs[0].get("y"))
                    lng = to_float(docs[0].get("x"))
                    if lat and lng:
                        return lat, lng
        except (urllib.error.URLError, urllib.error.HTTPError, Exception):
            pass
        return None

    q = urllib.parse.urlencode({"query": address})
    coords = req(f"{GEOCODE_URL}?{q}")
    if not coords:
        q2 = urllib.parse.urlencode({"query": address, "size": "1"})
        coords = req(f"{KEYWORD_URL}?{q2}")
    if coords:
        cache[h] = list(coords)
        time.sleep(GEOCODE_DELAY)
        return coords
    time.sleep(GEOCODE_DELAY)
    return None


def excel_str(sh, r: int, c: int) -> str:
    v = sh.cell_value(r, c)
    if sh.cell_type(r, c) == xlrd.XL_CELL_NUMBER:
        if v == int(v):
            return str(int(v))
        return str(v)
    return str(v).strip()


def yn_o(val) -> bool:
    return str(val).strip().upper() == "O"


def full_busan_donggu(raw: str, dong: str) -> str:
    s = re.sub(r"\s+", " ", (raw or "").strip())
    if not s:
        return s
    if s.startswith("부산광역시 동구"):
        return re.sub(r"\s+", " ", s).strip()
    if s.startswith("부산광역시"):
        return re.sub(r"\s+", " ", s).strip()
    if s.startswith("부산 "):
        rest = s[3:].lstrip()
        if rest.startswith("동구"):
            return re.sub(r"\s+", " ", ("부산광역시 " + rest)).strip()
        return re.sub(r"\s+", " ", ("부산광역시 동구 " + rest)).strip()
    if re.match(r"^동구\s+", s):
        return re.sub(r"\s+", " ", ("부산광역시 " + s)).strip()

    key_bits = ("부산", "동구", "로", "길", "대로")
    if not any(x in s for x in key_bits):
        d = (dong or "").replace(" ", "").strip()
        if d.endswith("동"):
            s = f"부산광역시 동구 {d} {s}"
        else:
            s = f"부산광역시 동구 {dong} {s}".strip() if dong else f"부산광역시 동구 {s}"
    elif not s.startswith("부산"):
        s = f"부산광역시 동구 {s}"

    return re.sub(r"\s+", " ", s).strip()


def geocode_query_variants(full_addr: str) -> list[str]:
    def _collapse(s: str) -> str:
        return re.sub(r"\s+", " ", (s or "").strip())

    def _tail_paren_strip(s: str) -> str:
        return _collapse(re.sub(r"\s*[\(（][^)）]*[\)）]\s*$", "", s))

    def add(q: str, out: list[str]) -> None:
        cq = _collapse(q)
        if cq and cq not in out:
            out.append(cq)

    seen: list[str] = []

    collapsed = _collapse(full_addr)
    comma_head = collapsed.split(",", 1)[0].strip()
    stripped_tail = _tail_paren_strip(collapsed)

    for q in (
        collapsed,
        comma_head,
        stripped_tail,
        _tail_paren_strip(comma_head),
    ):
        add(q, seen)

    base = comma_head or stripped_tail or collapsed

    spaced_alley = re.sub(r"([가-힣]+로)(\d+)(길)", r"\1 \2\3", base)
    if spaced_alley != base:
        add(spaced_alley, seen)
        base = spaced_alley
    ro_gil = re.sub(r"([가-힣]+로)\s+(\d+길)", r"\1\2", base)
    if ro_gil != base:
        add(ro_gil, seen)
        base = ro_gil
    ro_only = re.sub(
        r"^(부산광역시\s+동구\s+[가-힣\d\-]+(?:로|대로))\s+\d.+",
        r"\1",
        base,
    )
    if ro_only != base:
        add(ro_only, seen)
    return seen


def resolve_coords(
    road_address: str, place_name: str, dong: str, cache: dict, key: str
) -> tuple[float, float] | None:
    for qv in geocode_query_variants(road_address):
        c = kakao_geocode(qv, cache, key)
        if c:
            return c
    c = kakao_geocode(f"{road_address} {place_name}", cache, key)
    if c:
        return c
    for qv in geocode_query_variants(road_address):
        c = kakao_keyword_geocode(qv, cache, key)
        if c:
            return c
    d = (dong or "").strip()
    name_bits = {place_name}
    if "(" in place_name:
        name_bits.add(re.sub(r"\([^)]*\)", "", place_name).strip())
    for base in name_bits:
        for q in (
            f"부산 동구 {base}",
            f"동구 {base}",
            f"부산광역시 동구 {d} {base}",
            f"부산 {base}",
            base,
        ):
            if len(q.strip()) < 2:
                continue
            c = kakao_keyword_geocode(q, cache, key)
            if c:
                return c
    return None


def read_rows_from_xls(path: Path) -> list[tuple[int, str, str, str, str, bool, bool]]:
    wb = xlrd.open_workbook(str(path))
    sh = wb.sheet_by_index(0)
    dong_fill = ""
    out: list[tuple[int, str, str, str, str, bool, bool]] = []
    for r in range(3, sh.nrows):
        num_raw = sh.cell_value(r, 0)
        if isinstance(num_raw, float):
            seq = int(num_raw)
        else:
            seq_s = str(num_raw).strip()
            try:
                seq = int(float(seq_s))
            except ValueError:
                continue

        dong_cell = excel_str(sh, r, 1).strip()
        if dong_cell:
            dong_fill = dong_cell

        name = excel_str(sh, r, 2).strip()
        addr = excel_str(sh, r, 3).strip()
        phone = excel_str(sh, r, 4).strip()

        fire_o = yn_o(sh.cell_value(r, 5))
        _build_o = yn_o(sh.cell_value(r, 6))

        if not name or not addr:
            continue

        out.append((seq, dong_fill, name, addr, phone, fire_o, _build_o))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--xls",
        type=Path,
        default=Path.home()
        / "Downloads"
        / "종량제봉투판매소현황(전용마대표기)(1) (1).xls",
        help=".xls 경로",
    )
    args = ap.parse_args()
    src = args.xls.expanduser()
    if not src.exists():
        print(f"파일 없음: {src}", file=sys.stderr)
        sys.exit(1)

    ref_mtime = datetime.datetime.fromtimestamp(src.stat().st_mtime).strftime(
        "%Y-%m-%d"
    )

    rows = read_rows_from_xls(src)
    print(f"{len(rows)}행 파싱 · dataReferenceDate≈파일 수정일 {ref_mtime}", file=sys.stderr)

    cache = load_cache()
    stores: list[dict] = []
    failed: list[str] = []

    if not KAKAO_REST_KEY:
        print(
            "KAKAO_REST_API_KEY 없음. 좌표 없이 저장합니다.",
            file=sys.stderr,
        )

    for i, (seq, dong, name, addr_raw, phone, fire_o, _build_unused) in enumerate(rows):
        road = full_busan_donggu(addr_raw, dong)
        oid = f"busan-donggu-trash-{seq}"

        lat = lng = None
        if KAKAO_REST_KEY:
            c = resolve_coords(road, name, dong, cache, KAKAO_REST_KEY)
            if c:
                lat, lng = c

        if lat is None or lng is None:
            failed.append(f"{oid} {name} | {road}")

        row: dict = {
            "id": oid,
            "name": name,
            "roadAddress": road,
            "address": road,
            "businessStatus": "영업",
            "hasTrashBag": True,
            "hasSpecialBag": fire_o,
            "hasLargeWasteSticker": False,
            "adminVerified": False,
            "dataReferenceDate": ref_mtime,
        }
        if phone:
            row["phone"] = phone
        if lat is not None and lng is not None:
            row["lat"] = lat
            row["lng"] = lng

        stores.append(row)
        if (i + 1) % 45 == 0:
            save_cache(cache)
            print(f"  진행 {i+1}/{len(rows)}", file=sys.stderr)

    save_cache(cache)
    ok = sum(1 for s in stores if "lat" in s)
    print(f"좌표 {ok}/{len(stores)} 실패 {len(failed)}", file=sys.stderr)
    for line in failed[:25]:
        print(f"  {line}", file=sys.stderr)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(stores, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"저장: {OUT_JSON}", file=sys.stderr)


if __name__ == "__main__":
    main()
