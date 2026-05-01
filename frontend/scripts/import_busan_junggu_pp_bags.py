#!/usr/bin/env python3
"""
부산 중구 불연성·PP마대 지정판매업소 — 정적 HTML 표 파싱
  https://www.bsjunggu.go.kr/index.junggu?menuCd=DOM_000000109001001005
표: 동 / 상호명 / 전화번호 / 주소
- hasTrashBag=false, hasSpecialBag=true (normalizeRow 기준)

  python3 scripts/import_busan_junggu_pp_bags.py
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
OUT_JSON = FRONTEND / "public" / "data" / "stores.busan-junggu-pp.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-busan-junggu-pp.json"

PAGE_URL = "https://www.bsjunggu.go.kr/index.junggu?menuCd=DOM_000000109001001005"
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


def _clean_cell(html_fragment: str) -> str:
    t = re.sub(r"<[^>]+>", " ", html_fragment)
    t = t.replace("\u200b", "")
    return re.sub(r"\s+", " ", t).strip()


def fetch_page() -> str:
    r = urllib.request.Request(
        PAGE_URL,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "ko-KR,ko;q=0.9",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(r, timeout=45) as resp:
        return resp.read().decode("utf-8", errors="replace")


def scrape_modified_date(html: str) -> str:
    m = re.search(r"최종수정일\s*:\s*([\d\-]+)", html)
    return m.group(1).strip() if m else "2026-05-01"


def parse_pp_table(html: str) -> list[tuple[str, str, str, str]]:
    """(동, 상호명, 전화, 주소)"""
    m = re.search(
        r"<h2[^>]*>\s*PP마대\s*지정판매업소\s*</h2>\s*"
        r'<table[^>]*class="t_typel"[^>]*>[\s\S]*?<tbody>([\s\S]*?)</tbody>',
        html,
        re.IGNORECASE,
    )
    if not m:
        return []
    tbody = m.group(1)
    rows: list[tuple[str, str, str, str]] = []
    for tr in re.finditer(r"<tr[^>]*>([\s\S]*?)</tr>", tbody):
        tds = re.findall(r"<td[^>]*>([\s\S]*?)</td>", tr.group(1))
        if len(tds) != 4:
            continue
        dong, name, phone, addr = (_clean_cell(t) for t in tds)
        if dong == "동" or name == "상호명":
            continue
        if not dong or not name or not addr:
            continue
        rows.append((dong, name, phone, addr))
    return rows


def normalize_phone_local(raw: str) -> str:
    s = re.sub(r"\s+", "", (raw or "").strip())
    if not s:
        return ""
    if s.startswith("051"):
        return s
    if re.match(r"^\d{3}-\d{4}-\d{4}$", s):
        return "051-" + s
    if re.match(r"^\d{4}-\d{4}$", s):
        return "051-" + s
    if re.match(r"^\d{3}-\d{4}$", s):
        return "051-" + s
    return s


def full_busan_junggu_road(raw: str, dong: str) -> str:
    s = re.sub(r"\s+", " ", (raw or "").strip())
    if not s:
        return s
    if s.startswith("부산광역시"):
        return s
    if s.startswith("부산 "):
        rest = s[3:].lstrip()
        if rest.startswith("중구"):
            return "부산광역시 " + rest
        return "부산광역시 중구 " + rest
    if not any(x in s for x in ("부산", "중구", "로", "길", "대로")):
        d = (dong or "").replace(" ", "")
        if d.endswith("동"):
            s = f"부산광역시 중구 {d} {s}"
        else:
            s = f"부산광역시 중구 {s}"
    elif not s.startswith("부산"):
        s = f"부산광역시 중구 {s}"
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
        r"^(부산광역시\s+중구\s+[가-힣\d\-]+(?:로|대로))\s+\d.+",
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
            f"부산 중구 {base}",
            f"중구 {base}",
            f"부산광역시 중구 {d} {base}",
            f"부산 {base}",
            base,
        ):
            if len(q.strip()) < 2:
                continue
            c = kakao_keyword_geocode(q, cache, key)
            if c:
                return c
    return None


def stable_id(dong: str, name: str) -> str:
    h = hashlib.sha256(f"{dong}\0{name}".encode("utf-8")).hexdigest()[:12]
    return f"busan-junggu-pp-{h}"


def main():
    print(f"[fetch] {PAGE_URL}", file=sys.stderr)
    html = fetch_page()
    ref_date = scrape_modified_date(html)
    parsed = parse_pp_table(html)
    print(f"표에서 {len(parsed)}행 추출 · dataReferenceDate={ref_date}", file=sys.stderr)

    if not parsed:
        print("FAIL: 표 파싱 결과 없음", file=sys.stderr)
        sys.exit(1)

    cache = load_cache()
    stores: list[dict] = []
    failed: list[str] = []

    if not KAKAO_REST_KEY:
        print("KAKAO_REST_API_KEY 없음.", file=sys.stderr)

    for dong, name, phone_raw, addr_raw in parsed:
        road = full_busan_junggu_road(addr_raw, dong)
        oid = stable_id(dong, name)

        lat = lng = None
        if KAKAO_REST_KEY:
            c = resolve_coords(road, name, dong, cache, KAKAO_REST_KEY)
            if c:
                lat, lng = c

        phone = normalize_phone_local(phone_raw)

        row: dict = {
            "id": oid,
            "name": name,
            "roadAddress": road,
            "address": road,
            "businessStatus": "영업",
            "hasTrashBag": False,
            "hasSpecialBag": True,
            "hasLargeWasteSticker": False,
            "adminVerified": False,
            "dataReferenceDate": ref_date,
        }
        if phone:
            row["phone"] = phone
        if lat is not None and lng is not None:
            row["lat"] = lat
            row["lng"] = lng
        else:
            failed.append(f"{oid} {name} | {road}")

        stores.append(row)

    save_cache(cache)

    ok = sum(1 for s in stores if "lat" in s)
    print(f"좌표 {ok}/{len(stores)}", file=sys.stderr)
    for line in failed:
        print(f"  실패 {line}", file=sys.stderr)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(stores, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"저장: {OUT_JSON}", file=sys.stderr)


if __name__ == "__main__":
    main()
