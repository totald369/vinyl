#!/usr/bin/env python3
"""
부산광역시 중구 종량제 봉투 판매 업소 게시판 크롤
  https://www.bsjunggu.go.kr/dong/board/list.junggu?boardId=BBS_0000123&...
  startPage=1 .. 14 (총 138건)
- 연락처(전화번호)가 있으면 JSON phone 필드에 포함
- 카카오 주소·키워드 검색 지오코딩 (캐시: geocode-cache-busan-junggu-trash.json)

필요: frontend/.env.local 의 KAKAO_REST_API_KEY (또는 KAKAO_REST_KEY)

  python3 scripts/import_busan_junggu_trash.py
  python3 scripts/import_busan_junggu_trash.py --max-pages 1
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

FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.busan-junggu-trash.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-busan-junggu-trash.json"

USER_AGENT = "Mozilla/5.0 (compatible; VinylMapImport/1.0; +https://github.com/totald369/vinyl)"
FETCH_DELAY = 0.35

REF_DATE_DEFAULT = "2026-05-01"


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
GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
GEOCODE_DELAY = 0.06


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


def list_url(page: int) -> str:
    q = urllib.parse.urlencode(
        {
            "boardId": "BBS_0000123",
            "menuCd": "DOM_000000109001001011",
            "paging": "ok",
            "startPage": str(page),
        }
    )
    return f"https://www.bsjunggu.go.kr/dong/board/list.junggu?{q}"


def fetch_page(page: int) -> str:
    url = list_url(page)
    r = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "ko-KR,ko;q=0.9",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(r, timeout=45) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_junggu_rows(
    html: str,
) -> list[tuple[str, str, str, str, str, str]]:
    """
    게시 순번, 상호명, 동명, 원문주소, 전화, dataSid(게시물 키).
    """
    m = re.search(r"<tbody[^>]*>([\s\S]*?)</tbody>", html, re.IGNORECASE)
    if not m:
        return []
    block = m.group(1)
    out: list[tuple[str, str, str, str, str, str]] = []
    for tr in re.finditer(r"<tr[^>]*>([\s\S]*?)</tr>", block):
        tds = re.findall(r"<td[^>]*>([\s\S]*?)</td>", tr.group(1))
        if len(tds) < 6:
            continue
        board_num = _clean_cell(tds[0])
        name_cell = tds[1]
        sid_m = re.search(r"dataSid=(\d+)", name_cell)
        data_sid = sid_m.group(1) if sid_m else ""
        title_m = re.search(r'title="([^"]+)"', name_cell)
        name = title_m.group(1).strip() if title_m else _clean_cell(name_cell)
        dong = _clean_cell(tds[2])
        addr = _clean_cell(tds[3])
        phone = _clean_cell(tds[4])
        if not board_num.isdigit():
            continue
        if name in ("상호명", "") or addr in ("주소", ""):
            continue
        if not data_sid:
            continue
        out.append((board_num, name, dong, addr, phone, data_sid))
    return out


def full_busan_junggu_road(raw: str, dong: str) -> str:
    s = re.sub(r"\s+", " ", (raw or "").strip())
    if not s:
        return s
    if s.startswith("부산광역시"):
        return s
    if s.startswith("부산 "):
        return "부산광역시 " + s[3:].lstrip()
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-pages", type=int, default=14)
    args = ap.parse_args()

    all_rows: list[tuple[str, str, str, str, str, str]] = []
    seen_sid: set[str] = set()
    for p in range(1, args.max_pages + 1):
        print(f"[fetch] page {p}/{args.max_pages}", file=sys.stderr)
        html = fetch_page(p)
        rows = parse_junggu_rows(html)
        if not rows:
            print(f"  WARNING: 페이지 {p}에서 행 0건", file=sys.stderr)
            break
        for row in rows:
            sid = row[5]
            if sid not in seen_sid:
                seen_sid.add(sid)
                all_rows.append(row)
        time.sleep(FETCH_DELAY)

    print(f"총 {len(all_rows)}행 파싱(고유 dataSid)", file=sys.stderr)

    cache = load_cache()

    stores: list[dict] = []
    failed: list[str] = []

    if not KAKAO_REST_KEY:
        print(
            "KAKAO_REST_API_KEY 없음. 좌표 없이 저장합니다.",
            file=sys.stderr,
        )

    for i, (_board_num, name, dong, addr_raw, phone, data_sid) in enumerate(all_rows):
        road = full_busan_junggu_road(addr_raw, dong)
        oid = f"busan-junggu-trash-{data_sid}"

        lat = lng = None
        if KAKAO_REST_KEY:
            coords = resolve_coords(road, name, dong, cache, KAKAO_REST_KEY)
            if coords:
                lat, lng = coords
        if lat is None or lng is None:
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
            "dataReferenceDate": REF_DATE_DEFAULT,
        }
        if phone:
            row["phone"] = phone
        if lat is not None and lng is not None:
            row["lat"] = lat
            row["lng"] = lng

        stores.append(row)
        if (i + 1) % 40 == 0:
            save_cache(cache)
            print(f"  진행 {i+1}/{len(all_rows)}", file=sys.stderr)

    save_cache(cache)

    with_coords = [s for s in stores if "lat" in s and "lng" in s]
    print(
        f"좌표 성공 {len(with_coords)}/{len(stores)}, 실패 {len(failed)}",
        file=sys.stderr,
    )
    if failed[:20]:
        print("실패 샘플:", file=sys.stderr)
        for line in failed[:20]:
            print(f"  {line}", file=sys.stderr)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(stores, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"저장: {OUT_JSON}", file=sys.stderr)


if __name__ == "__main__":
    main()
