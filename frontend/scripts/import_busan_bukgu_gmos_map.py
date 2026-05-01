#!/usr/bin/env python3
"""
부산 북구 GMOS 지도 HTML에서 판매소 목록 수집
  http://map.gmos.kr/index_bukgu.php?prod=10   일반(종량제)
  http://map.gmos.kr/index_bukgu.php?prod=80   불연성

  python3 scripts/import_busan_bukgu_gmos_map.py
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

FRONTEND = Path(__file__).resolve().parent.parent
OUT_TRASH = FRONTEND / "public" / "data" / "stores.busan-bukgu-trash.json"
OUT_SPECIAL = FRONTEND / "public" / "data" / "stores.busan-bukgu-special.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-busan-bukgu.json"

BASE = "http://map.gmos.kr/index_bukgu.php"
USER_AGENT = "Mozilla/5.0 (compatible; VinylMapImport/1.0; +https://github.com/totald369/vinyl)"
GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
GEOCODE_DELAY = 0.06

LI_BLOCK = re.compile(r"<li>\s*([\s\S]*?)</li>", re.IGNORECASE)


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
    return re.sub(r"\s+", " ", (s or "").strip())


def full_busan_bukgu(raw: str) -> str:
    s = collapse(raw)
    if not s:
        return s
    if s.startswith("부산광역시"):
        return s
    if s.startswith("부산시"):
        return collapse("부산광역시 " + s[3:].lstrip())
    if s.startswith("부산 ") and not s.startswith("부산광역시"):
        return collapse("부산광역시 " + s[3:].lstrip())
    return collapse(f"부산광역시 북구 {s}")


def sale_to_iso(d: str) -> str:
    p = (d or "").strip().split(".")
    if len(p) == 3 and all(x.isdigit() for x in p):
        return f"{p[0]}-{p[1].zfill(2)}-{p[2].zfill(2)}"
    return "2026-05-01"


def fmt_phone(raw: str) -> str:
    s = collapse(str(raw))
    if not s or s == "0":
        return ""
    if re.match(r"^051-\d{3,4}-\d{4}$", s):
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


def parse_li(fragment: str) -> tuple[str, str, str, str, str] | None:
    """mv_key, name, address, phone_raw, sale_date"""
    if "mapCenterMoveFunc" not in fragment or 'class="name"' not in fragment:
        return None
    m_mv = re.search(r"mapCenterMoveFunc\(\'([^\']+)\',this\)", fragment)
    m_nm = re.search(r"<p\s+class=\"name\">\s*([^<]+)</p>", fragment)
    m_ad = re.search(
        r'<p\s+class="address">\s*<i[^>]*></i>\s*([^<]*)</p>', fragment
    )
    m_tl = re.search(r'<p\s+class="tel">전화\s*:\s*([^<]*)</p>', fragment)
    m_dt = re.search(r"최근판매일\s*:\s*([\d\.]+)", fragment)
    if not (m_mv and m_nm and m_ad and m_dt):
        return None
    tel = fmt_phone(m_tl.group(1)) if m_tl else ""
    return (
        m_mv.group(1).strip(),
        m_nm.group(1).strip(),
        m_ad.group(1).strip(),
        tel,
        m_dt.group(1).strip(),
    )


def parse_page(html: str) -> list[tuple[str, str, str, str, str]]:
    rows: list[tuple[str, str, str, str, str]] = []
    seen: set[tuple[str, str]] = set()
    for block in LI_BLOCK.findall(html):
        p = parse_li(block)
        if not p:
            continue
        _, name, addr, _, _ = p
        key = (collapse(name), collapse(addr))
        if key in seen:
            continue
        seen.add(key)
        rows.append(p)
    return rows


def fetch_bukgu(prod: str) -> str:
    q = urllib.parse.urlencode(
        {"prod": prod, "dong": "", "searchText": "", "sizea": ""}
    )
    url = f"{BASE}?{q}"
    r = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "ko-KR,ko;q=0.9",
        },
    )
    with urllib.request.urlopen(r, timeout=60) as resp:
        raw = resp.read()
    for enc in ("utf-8", "cp949", "euc-kr"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def stable_id(prefix: str, name: str, addr: str) -> str:
    h = hashlib.sha256(f"{name}\0{addr}".encode("utf-8")).hexdigest()[:12]
    return f"{prefix}-{h}"


def geocode_query_variants(full_addr: str) -> list[str]:
    def _tail_paren_strip(s: str) -> str:
        return collapse(re.sub(r"\s*[\(（][^)）]*[\)）]\s*$", "", s))

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
        r"^(부산광역시\s+북구\s+[가-힣\d\s]+?(?:로|대로))\s+\d.+",
        r"\1",
        base,
    )
    if ro_only != base:
        add(ro_only, seen)
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
    name_bits = {place_name}
    if "(" in place_name:
        name_bits.add(re.sub(r"\([^)]*\)", "", place_name).strip())
    for base in name_bits:
        for q in (
            f"부산 북구 {base}",
            f"북구 {base}",
            f"부산 {base}",
            base,
        ):
            if len(q.strip()) < 2:
                continue
            c = kakao_keyword_geocode(q, cache, key)
            if c:
                return c
    return None


def build_stores(
    rows: list[tuple[str, str, str, str, str]],
    *,
    id_prefix: str,
    has_trash: bool,
    has_special: bool,
    label: str,
) -> tuple[list[dict], list[str]]:
    cache = load_cache()
    stores: list[dict] = []
    failed: list[str] = []
    if not KAKAO_REST_KEY:
        print(f"경고 [{label}]: KAKAO_REST_API_KEY 없음", file=sys.stderr)

    for i, (_mv, name, addr_disp, tel, sale) in enumerate(rows):
        road = full_busan_bukgu(addr_disp)
        oid = stable_id(id_prefix, name, addr_disp)
        ref = sale_to_iso(sale)

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
            "hasTrashBag": has_trash,
            "hasSpecialBag": has_special,
            "hasLargeWasteSticker": False,
            "adminVerified": False,
            "dataReferenceDate": ref,
        }
        if tel:
            row["phone"] = tel
        if lat is not None and lng is not None:
            row["lat"] = lat
            row["lng"] = lng

        stores.append(row)
        if (i + 1) % 65 == 0:
            save_cache(cache)
            print(f"    [{label}] {i+1}/{len(rows)}", file=sys.stderr)

    save_cache(cache)
    return stores, failed


def main():
    print("[fetch] prod=10 종량제(일반)...", file=sys.stderr)
    html_tr = fetch_bukgu("10")
    rows_tr = parse_page(html_tr)
    print(f"  파싱 {len(rows_tr)}건", file=sys.stderr)

    print("[fetch] prod=80 불연성...", file=sys.stderr)
    html_sp = fetch_bukgu("80")
    rows_sp = parse_page(html_sp)
    print(f"  파싱 {len(rows_sp)}건", file=sys.stderr)

    print("[geocode] 종량제...", file=sys.stderr)
    ts, tfail = build_stores(
        rows_tr,
        id_prefix="busan-bukgu-trash",
        has_trash=True,
        has_special=False,
        label="trash",
    )
    ot = sum(1 for r in ts if "lat" in r)
    print(f"  좌표 {ot}/{len(ts)} 실패 {len(tfail)}", file=sys.stderr)
    for ln in tfail[:25]:
        print(f"    {ln}", file=sys.stderr)

    print("[geocode] 불연성...", file=sys.stderr)
    ss, sfail = build_stores(
        rows_sp,
        id_prefix="busan-bukgu-special",
        has_trash=False,
        has_special=True,
        label="special",
    )
    ost = sum(1 for r in ss if "lat" in r)
    print(f"  좌표 {ost}/{len(ss)} 실패 {len(sfail)}", file=sys.stderr)
    for ln in sfail[:25]:
        print(f"    {ln}", file=sys.stderr)

    OUT_TRASH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_TRASH, "w", encoding="utf-8") as f:
        json.dump(ts, f, ensure_ascii=False, indent=2)
        f.write("\n")
    with open(OUT_SPECIAL, "w", encoding="utf-8") as f:
        json.dump(ss, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"저장: {OUT_TRASH}", file=sys.stderr)
    print(f"저장: {OUT_SPECIAL}", file=sys.stderr)


if __name__ == "__main__":
    main()
