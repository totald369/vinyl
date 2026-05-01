#!/usr/bin/env python3
"""
부산 영도구 종량제봉투 판매소 .xls (시트별 동 구역, 연번·상호·주소·전화)

  pip3 install 'xlrd<2'
  python3 scripts/import_busan_yeongdo_trash_from_xls.py \\
    --xls ~/Downloads/'영도구 쓰레기봉투 판매소 현황(2022.2월).xls'
"""

from __future__ import annotations

import argparse
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
OUT_JSON = FRONTEND / "public" / "data" / "stores.busan-yeongdo-trash.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-busan-yeongdo-trash.json"

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
GEOCODE_DELAY = 0.06

SKIP_SHEETS = frozenset({"동별 총 개소수"})


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


def collapse(s: str) -> str:
    s = (s or "").replace("\xa0", " ").replace("\u200b", "")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def excel_str(sh, r: int, c: int) -> str:
    v = sh.cell_value(r, c)
    if sh.cell_type(r, c) == xlrd.XL_CELL_NUMBER:
        if v == int(v):
            return str(int(v))
        return str(v)
    return collapse(str(v))


def find_header_base(sh) -> int | None:
    for c in range(sh.ncols):
        hn = re.sub(r"\s+", "", str(sh.cell_value(0, c)))
        if hn.startswith("연번"):
            return c
    return None


_BUSAN_GU = re.compile(
    r"^(중구|서구|동구|영도구|부산진구|동래구|남구|북구|해운대구|사하구|"
    r"금정구|강서구|연제구|수영구|사상구|기장군)\s+"
)


def full_busan_yeongdo(addr_raw: str, sheet_name: str) -> str:
    """영도구 시트 주소에는 영도구를 붙이고, 「영도구외」 등 타 구 주소는 구명만 반영."""
    s = collapse(str(addr_raw or ""))
    if not s:
        return s
    if s.startswith("부산광역시"):
        return s
    if s.startswith("부산시"):
        return collapse("부산광역시 " + s[3:].lstrip())
    if s.startswith("부산 ") and not s.startswith("부산광역시"):
        return collapse("부산광역시 " + s[len("부산") :].lstrip())
    if _BUSAN_GU.match(s):
        return collapse(f"부산광역시 {s}")
    if s.startswith("영도구"):
        return collapse(f"부산광역시 {s}")
    if sheet_name == "영도구외":
        return collapse(f"부산광역시 {s}")
    if not s.startswith("부산"):
        return collapse(f"부산광역시 영도구 {s}")
    return s


def strip_trailing_lot_paren(s: str) -> str:
    """엑셀 지번 「(본번/부번)」「(블록세대)」 꼬리 괄호 제거 후 지오코딩 재시도."""
    prev = ""
    while prev != s:
        prev = s
        s = re.sub(r"\s*\(\s*\d+\s*/\s*\d+\s*\)\s*$", "", s)
        s = re.sub(r"\s*\(\s*\d+-\d+\s*\)\s*$", "", s)
        s = collapse(s)
    return s


def massage_for_geocode(road: str) -> str:
    s = collapse(road)
    s = strip_trailing_lot_paren(s)
    s = re.sub(r"(로)(\d+)(번길)", r"\1 \2\3", s)
    s = re.sub(r"(로)(\d번길)", r"\1 \2", s)
    # 「남항동1가230번지」 등 가와 번지·숫자 사이 공백 누락 → 먼저 띄운 뒤 번지 접미 제거
    s = re.sub(r"(동\d+가)(\d)", r"\1 \2", s)
    s = re.sub(r"(동\d+가)(\d+번지)", r"\1 \2", s)
    s = re.sub(r"(\d+)번지\b", r"\1", s)
    # 행정동 표기 → 카카오 법정동 검색에 맞춤
    for a, b in (
        ("청학1동 ", "청학동 "),
        ("청학2동 ", "청학동 "),
        ("동삼1동 ", "동삼동 "),
        ("동삼2동 ", "동삼동 "),
        ("동삼3동 ", "동삼동 "),
    ):
        s = s.replace(a, b)
    s = re.sub(r"(\S동)\s*산(\d)", r"\1 산 \2", s)
    s = re.sub(r"(\S동)\s+산\s+(\d+(?:-\d+)?)", r"\1 산\2", s)
    return collapse(s)


def fmt_phone(raw: object) -> str:
    if raw is None or str(raw).strip() == "":
        return ""
    s = collapse(str(raw))
    if re.match(r"^051-\d{3}-\d{4}$", s) or re.match(r"^051-\d{4}-\d{4}$", s):
        return s
    digits = re.sub(r"\D", "", s)
    if not digits:
        return ""
    if digits.startswith("051") and len(digits) == 11:
        return f"051-{digits[3:6]}-{digits[6:]}"
    if len(digits) == 10 and digits.startswith("051"):
        return f"051-{digits[3:7]}-{digits[7:]}"
    if len(digits) == 7:
        return f"051-{digits[:3]}-{digits[3:]}"
    return s


def dong_ga_spacing(addr: str) -> str | None:
    """「남항동2가」→「남항동 2가」 (법정동+가 공백) 지오코딩 보조."""
    x = collapse(addr)
    y = re.sub(r"([가-힣]+동)(\d+가)", r"\1 \2", x)
    return y if y != x else None


def progressive_short_addresses(addr: str) -> list[str]:
    """동·리 단위까지 줄여 주소 검색 (도로·지번 미연계 지번 대비)."""
    variants: list[str] = []
    seen: set[str] = set()
    cur = collapse(addr)
    for _ in range(14):
        shorter: str | None = None
        parts_tw = cur.rsplit(None, 1)
        if len(parts_tw) == 2:
            head0, tail0 = parts_tw[0], parts_tw[1]
            if re.fullmatch(r"[가-힣]{2,}", tail0):
                shorter = collapse(head0)
            elif (
                tail0.endswith("내")
                and len(tail0) <= 8
                and re.fullmatch(r"[가-힣]{2,8}", tail0)
            ):
                shorter = collapse(head0)
        if not shorter:
            jh = jibun_drop_last_hyphen(cur)
            if jh and jh != cur:
                shorter = jh
        if not shorter and len(parts_tw) == 2:
            tail = parts_tw[1]
            if re.fullmatch(r"\d+-\d+(-\d+)?", tail):
                shorter = collapse(parts_tw[0])
            elif re.fullmatch(r"\d+", tail):
                shorter = collapse(parts_tw[0])
        if shorter and shorter != cur and shorter not in seen and len(shorter) >= 10:
            variants.append(shorter)
            seen.add(shorter)
            cur = shorter
            continue
        spaced = dong_ga_spacing(cur)
        if spaced and spaced not in seen:
            variants.append(spaced)
            seen.add(spaced)
            cur = spaced
            continue
        break
    return variants


def jibun_drop_last_hyphen(addr: str) -> str | None:
    """… 114-3 / 38-4 / 1121-1 … 지번 단일 하이픈 부번 제거."""
    s = collapse(addr)
    m = re.match(r"^(.+)\s(\d+)-(\d+)$", s)
    if m:
        return collapse(m.group(1) + " " + m.group(2))
    m2 = re.match(r"^(.+)\s(\d+)-(\d+)\s+", s)
    if m2:
        return collapse(m2.group(1) + " " + m2.group(2))
    return None


def geocode_query_variants(full_addr: str) -> list[str]:
    def _tail_paren_strip(x: str) -> str:
        return collapse(re.sub(r"\s*[\(（][^)）]*[\)）]\s*$", "", x))

    def add(q: str, out: list[str]) -> None:
        cq = collapse(q)
        if cq and cq not in out:
            out.append(cq)

    seen: list[str] = []
    collapsed = collapse(full_addr)
    comma_head = collapsed.split(",", 1)[0].strip()
    stripped_tail = _tail_paren_strip(collapsed)
    for q in (collapsed, comma_head, stripped_tail, _tail_paren_strip(comma_head)):
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
        r"^(부산광역시\s+영도구\s+[가-힣\d\s]+?(?:로|대로))\s+\d.+",
        r"\1",
        base,
    )
    if ro_only != base:
        add(ro_only, seen)

    spaced = dong_ga_spacing(collapsed)
    if spaced:
        add(spaced, seen)
        sh = strip_trailing_lot_paren(spaced)
        if sh != spaced:
            add(sh, seen)
    jdh = jibun_drop_last_hyphen(collapsed)
    if jdh:
        add(jdh, seen)
        if spaced:
            j2 = jibun_drop_last_hyphen(spaced)
            if j2:
                add(j2, seen)
    return seen


def resolve_coords(
    road_address: str, place_name: str, cache: dict, key: str
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

    bits = {place_name}
    if "(" in place_name:
        bits.add(re.sub(r"\([^)]*\)", "", place_name).strip())
    for b in bits:
        qs = [f"부산 {b}", b]
        if "영도구" in road_address:
            qs = [f"부산 영도구 {b}", f"영도구 {b}", *qs]
        for q in qs:
            if len(q.strip()) < 2:
                continue
            c = kakao_keyword_geocode(q, cache, key)
            if c:
                return c

    if " 산" in road_address:
        alt = collapse(re.sub(r"\s산(\d+(?:-\d+)?)", r" \1", road_address))
        if alt != road_address:
            c = kakao_geocode(alt, cache, key)
            if c:
                return c
            c = kakao_keyword_geocode(alt, cache, key)
            if c:
                return c

    pn = collapse(place_name)
    for q in (f"{pn} 영도구", f"{pn} 영도 부산", pn):
        if len(q) >= 4:
            c = kakao_keyword_geocode(q, cache, key)
            if c:
                return c

    for alt_raw in filter(
        None,
        (
            dong_ga_spacing(road_address),
            jibun_drop_last_hyphen(road_address),
        ),
    ):
        alt = collapse(alt_raw)
        if alt == road_address:
            continue
        for qv in geocode_query_variants(alt):
            c = kakao_geocode(qv, cache, key)
            if c:
                return c
        c = kakao_keyword_geocode(alt, cache, key)
        if c:
            return c

    alt_sp = dong_ga_spacing(road_address)
    if alt_sp:
        combo = jibun_drop_last_hyphen(collapse(alt_sp))
        if combo and combo != road_address:
            for qv in geocode_query_variants(combo):
                c = kakao_geocode(qv, cache, key)
                if c:
                    return c
            c = kakao_keyword_geocode(combo, cache, key)
            if c:
                return c

    tail_drop = collapse(re.sub(r"\s+[가-힣]+$", "", road_address))
    if tail_drop != road_address and tail_drop:
        for qv in geocode_query_variants(tail_drop):
            c = kakao_geocode(qv, cache, key)
            if c:
                return c
        c = kakao_keyword_geocode(tail_drop, cache, key)
        if c:
            return c

    for shortened in progressive_short_addresses(road_address):
        for qv in geocode_query_variants(shortened):
            c = kakao_geocode(qv, cache, key)
            if c:
                return c
            c = kakao_keyword_geocode(qv, cache, key)
            if c:
                return c

    return None


def ref_date_from_filename(path: Path) -> str:
    m = re.search(r"\((\d{4})\.(\d+)\s*월", path.name)
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
        return f"{y:04d}-{mo:02d}-01"
    m2 = re.search(r"(\d{8})", path.name)
    if m2:
        d = m2.group(1)
        return f"{d[:4]}-{d[4:6]}-{d[6:]}"
    return "2022-02-01"


def parse_workbook(path: Path) -> list[tuple[str, str, str, str]]:
    """(sheet_name, 상호, 주소 원문, 전화 원문) 전 시트 평탄화."""
    wb = xlrd.open_workbook(str(path))
    out: list[tuple[str, str, str, str]] = []
    for sn in wb.sheet_names():
        if sn in SKIP_SHEETS:
            continue
        sh = wb.sheet_by_name(sn)
        base = find_header_base(sh)
        if base is None or base + 2 >= sh.ncols:
            continue
        for r in range(1, sh.nrows):
            name = excel_str(sh, r, base + 1)
            addr = excel_str(sh, r, base + 2)
            tel = excel_str(sh, r, base + 3) if base + 3 < sh.ncols else ""
            if not name or not addr:
                continue
            out.append((sn, name, addr, tel))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--xls",
        type=Path,
        default=Path.home()
        / "Downloads"
        / "영도구 쓰레기봉투 판매소 현황(2022.2월).xls",
    )
    args = ap.parse_args()
    xp = args.xls.expanduser()
    if not xp.exists():
        print(f"파일 없음: {xp}", file=sys.stderr)
        sys.exit(1)

    ref_date = ref_date_from_filename(xp)
    parsed = parse_workbook(xp)
    print(f"파싱 {len(parsed)}건 · ref={ref_date}", file=sys.stderr)

    cache = load_cache()
    if not KAKAO_REST_KEY:
        print("KAKAO_REST_API_KEY 없음.", file=sys.stderr)

    stores: list[dict] = []
    failed: list[str] = []

    for i, (sheet, name, addr_raw, tel_raw) in enumerate(parsed):
        road = massage_for_geocode(full_busan_yeongdo(addr_raw, sheet))
        oid = f"busan-yeongdo-trash-{i + 1}"

        lat = lng = None
        if KAKAO_REST_KEY:
            c = resolve_coords(road, name, cache, KAKAO_REST_KEY)
            if c:
                lat, lng = c

        if lat is None:
            failed.append(f"{oid} {name} | {road}")

        row: dict = {
            "id": oid,
            "name": name,
            "roadAddress": road,
            "address": road,
            "businessStatus": "영업",
            "hasTrashBag": True,
            "hasSpecialBag": False,
            "hasLargeWasteSticker": False,
            "adminVerified": False,
            "dataReferenceDate": ref_date,
        }

        phone = fmt_phone(tel_raw)
        if phone and phone != "051-000-0000":
            row["phone"] = phone
        if lat is not None and lng is not None:
            row["lat"] = lat
            row["lng"] = lng

        stores.append(row)
        if (i + 1) % 60 == 0:
            save_cache(cache)
            print(f"  진행 {i+1}/{len(parsed)}", file=sys.stderr)

    save_cache(cache)

    ok = sum(1 for s in stores if "lat" in s)
    print(f"좌표 {ok}/{len(stores)} 실패 {len(failed)}", file=sys.stderr)
    for ln in failed[:35]:
        print(f"  {ln}", file=sys.stderr)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(stores, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"저장: {OUT_JSON}", file=sys.stderr)


if __name__ == "__main__":
    main()
