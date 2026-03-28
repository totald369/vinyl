#!/usr/bin/env python3
"""
동작구청 포털 종량제봉투 판매소 게시판 HTML 크롤 → stores.sample.json 병합.
- https://dongjak.go.kr/portal/bbs/B0001398/list.do?menuNo=201682 (pageIndex 1~N)
- 목록에 있는 매장은 종량제봉투 판매처로 간주(hasTrashBag=True)
- 특수마대 열: '판매' → hasSpecialBag=True, '미판매' → False
- 주소에 시·구가 없으면 '서울특별시 동작구 ' 접두
- 카카오 지오코딩 (캐시: geocode-cache-dongjak.json)

사용:
  .env.local 의 KAKAO_REST_API_KEY
  python3 scripts/import_dongjak_bbs.py
  python3 scripts/import_dongjak_bbs.py --max-pages 5   # 테스트용
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
OUT_JSON = FRONTEND / "public" / "data" / "stores.sample.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-dongjak.json"

LIST_URL = "https://dongjak.go.kr/portal/bbs/B0001398/list.do?menuNo=201682&pageIndex={page}"
USER_AGENT = "Mozilla/5.0 (compatible; VinylMapImport/1.0; +https://github.com/totald369/vinyl)"
FETCH_DELAY = 0.35


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


def norm_store_name(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    a = re.sub(r"\s+", " ", addr.strip().lower())
    return f"{norm_store_name(name).lower()}|{a}"


def fetch_list_page(page: int) -> str:
    url = LIST_URL.format(page=page)
    r = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "ko-KR,ko;q=0.9",
        },
    )
    with urllib.request.urlopen(r, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def max_page_index(html: str) -> int:
    nums: list[int] = []
    for m in re.finditer(
        r"/portal/bbs/B0001398/list\.do\?[^\"']*pageIndex=(\d+)",
        html,
    ):
        nums.append(int(m.group(1)))
    return max(nums) if nums else 1


def parse_site_update_date(html: str) -> str | None:
    m = re.search(
        r"최종업데이트</span></dt>\s*<dd>[\s\S]*?(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일",
        html,
    )
    if not m:
        return None
    y, mo, d = m.groups()
    return f"{y}-{int(mo):02d}-{int(d):02d}"


def _clean_cell(html_fragment: str) -> str:
    t = re.sub(r"<[^>]+>", " ", html_fragment)
    return re.sub(r"\s+", " ", t).strip()


def parse_table_rows(html: str) -> list[tuple[str, str, str, str, str]]:
    """(연번, 동명, 사업장명, 주소, 특수마대표시)."""
    m = re.search(
        r'class="bdList"[\s\S]*?<tbody>([\s\S]*?)</tbody>\s*</table>',
        html,
        re.IGNORECASE,
    )
    if not m:
        return []
    block = m.group(1)
    out: list[tuple[str, str, str, str, str]] = []
    for tr in re.finditer(r"<tr>([\s\S]*?)</tr>", block):
        tds = re.findall(r"<td[^>]*>([\s\S]*?)</td>", tr.group(1))
        if len(tds) < 5:
            continue
        row = tuple(_clean_cell(x) for x in tds[:5])
        if row[2] == "사업장명" or row[3] == "주소":
            continue
        out.append(row)
    return out


def full_dongjak_address(street_part: str) -> str:
    s = re.sub(r"\s+", " ", (street_part or "").strip())
    if not s:
        return s
    if s.startswith("서울"):
        return s
    return f"서울특별시 동작구 {s}"


def geocode_query_variants(full_addr: str) -> list[str]:
    seen: list[str] = []
    for q in (full_addr, re.sub(r"\s+", " ", full_addr).strip()):
        if q and q not in seen:
            seen.append(q)
    base = full_addr
    spaced_alley = re.sub(r"([가-힣]+로)(\d+)(길)", r"\1 \2\3", base)
    if spaced_alley != base and spaced_alley not in seen:
        seen.append(spaced_alley)
        base = spaced_alley
    ro_gil = re.sub(r"([가-힣]+로)\s+(\d+길)", r"\1\2", base)
    if ro_gil != base and ro_gil not in seen:
        seen.append(ro_gil)
        if "," in ro_gil:
            h0 = ro_gil.split(",")[0].strip()
            if h0 not in seen:
                seen.append(h0)
    if "," in base:
        head = base.split(",")[0].strip()
        if head and head not in seen:
            seen.append(head)
    m = re.search(r"([가-힣]+(?:로|길))\s+(\d+)-(\d+)", base)
    if m:
        stripped = base.replace(m.group(0), f"{m.group(1)} {m.group(2)}", 1)
        if stripped not in seen:
            seen.append(stripped)
        if "," in stripped:
            h = stripped.split(",")[0].strip()
            if h not in seen:
                seen.append(h)
    if "~" in full_addr:
        no_tilde = re.sub(r"\s+\d+~\d+호.*$", "", full_addr).strip()
        if no_tilde and no_tilde not in seen:
            seen.append(no_tilde)
            ng = re.sub(r"([가-힣]+로)\s+(\d+길)", r"\1\2", no_tilde)
            if ng != no_tilde and ng not in seen:
                seen.append(ng)
            if "," in no_tilde:
                h3 = no_tilde.split(",")[0].strip()
                if h3 not in seen:
                    seen.append(h3)
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
        for q in (f"동작구 {base}", base, f"서울 {base}"):
            c = kakao_keyword_geocode(q, cache, key)
            if c:
                return c
    return None


def rows_to_records(
    rows: list[tuple[str, str, str, str, str]], ref_date: str | None
) -> list[dict]:
    out: list[dict] = []
    for _seq, dong, name, addr_raw, special_cell in rows:
        name = name.strip()
        addr_raw = addr_raw.strip()
        if not name or not addr_raw:
            continue
        spec = special_cell.strip()
        has_special = spec == "판매"
        road = full_dongjak_address(addr_raw)
        out.append(
            {
                "name": name,
                "roadAddress": road,
                "address": road,
                "businessStatus": "영업",
                "hasTrashBag": True,
                "hasSpecialBag": has_special,
                "hasLargeWasteSticker": False,
                "adminVerified": False,
                "dataReferenceDate": ref_date,
                "_dong": dong,
            }
        )
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--max-pages",
        type=int,
        default=0,
        help="0이면 사이트에서 끝 페이지를 읽어 전체 수집, 양수면 최대 N페이지만",
    )
    args = ap.parse_args()

    if not KAKAO_REST_KEY:
        print("KAKAO_REST_KEY 또는 KAKAO_REST_API_KEY 가 필요합니다.")
        raise SystemExit(1)

    print("1페이지 요청…")
    html1 = fetch_list_page(1)
    ref_date = parse_site_update_date(html1)
    last_page = max_page_index(html1)
    if args.max_pages and args.max_pages > 0:
        last_page = min(last_page, args.max_pages)
    print(f"  갱신일(추정): {ref_date}, 총 {last_page}페이지까지 수집")

    all_rows: list[tuple[str, str, str, str, str]] = []
    for p in range(1, last_page + 1):
        h = html1 if p == 1 else fetch_list_page(p)
        if p > 1:
            time.sleep(FETCH_DELAY)
        part = parse_table_rows(h)
        if not part:
            print(f"  경고: {p}페이지 파싱 결과 없음")
            continue
        all_rows.extend(part)
        if p == 1 or p % 10 == 0 or p == last_page:
            print(f"  페이지 {p}/{last_page} … {len(part)}행 (누적 {len(all_rows)})")

    raw = rows_to_records(all_rows, ref_date)
    by_key: dict[str, dict] = {}
    for s in raw:
        k0 = norm_key(s["name"], s["roadAddress"])
        if k0 not in by_key:
            by_key[k0] = s
        else:
            prev = by_key[k0]
            prev["hasSpecialBag"] = prev["hasSpecialBag"] or s["hasSpecialBag"]
            if s.get("dataReferenceDate") and (
                not prev.get("dataReferenceDate")
                or s["dataReferenceDate"] > prev["dataReferenceDate"]
            ):
                prev["dataReferenceDate"] = s["dataReferenceDate"]

    unique = list(by_key.values())
    print(f"중복 제거 후 {len(unique)}건 (원본 행 {len(all_rows)})")

    cache = load_cache()
    geocode_failed: list[str] = []
    print("지오코딩 중…")
    for i, s in enumerate(unique):
        coords = resolve_coords(s["roadAddress"], s["name"], cache, KAKAO_REST_KEY)
        if not coords:
            geocode_failed.append(s["name"])
            s["lat"] = None
            s["lng"] = None
        else:
            s["lat"], s["lng"] = coords
        if (i + 1) % 50 == 0:
            save_cache(cache)
            print(f"  …{i + 1}/{len(unique)}")
    save_cache(cache)

    if geocode_failed:
        print(f"좌표 실패 {len(geocode_failed)}건 (일부): {geocode_failed[:25]}")

    with open(OUT_JSON, "r", encoding="utf-8") as f:
        existing = json.load(f)

    max_id = 0
    for e in existing:
        try:
            max_id = max(max_id, int(str(e.get("id", "0"))))
        except ValueError:
            pass

    exist_keys = {
        norm_key(e.get("name", ""), e.get("roadAddress") or e.get("address", ""))
        for e in existing
    }

    added = 0
    updated = 0
    for s in unique:
        k0 = norm_key(s["name"], s["roadAddress"])
        if k0 in exist_keys:
            for e in existing:
                if norm_key(e.get("name", ""), e.get("roadAddress") or e.get("address", "")) != k0:
                    continue
                ch = False
                nt = bool(e.get("hasTrashBag")) or s["hasTrashBag"]
                ns = bool(e.get("hasSpecialBag")) or s["hasSpecialBag"]
                if nt != bool(e.get("hasTrashBag")):
                    ch = True
                if ns != bool(e.get("hasSpecialBag")):
                    ch = True
                e["hasTrashBag"] = nt
                e["hasSpecialBag"] = ns
                if s.get("dataReferenceDate"):
                    od = e.get("dataReferenceDate") or ""
                    if not od or (s["dataReferenceDate"] > od):
                        e["dataReferenceDate"] = s["dataReferenceDate"]
                        ch = True
                if (e.get("lat") is None or e.get("lng") is None) and s.get("lat") is not None:
                    e["lat"] = s["lat"]
                    e["lng"] = s["lng"]
                    ch = True
                if ch:
                    updated += 1
                break
            continue
        if s.get("lat") is None:
            continue
        max_id += 1
        exist_keys.add(k0)
        rec = {
            "id": str(max_id),
            "name": s["name"],
            "lat": s["lat"],
            "lng": s["lng"],
            "roadAddress": s["roadAddress"],
            "address": s["address"],
            "businessStatus": s["businessStatus"],
            "hasTrashBag": s["hasTrashBag"],
            "hasSpecialBag": s["hasSpecialBag"],
            "hasLargeWasteSticker": False,
            "adminVerified": False,
        }
        if s.get("dataReferenceDate"):
            rec["dataReferenceDate"] = s["dataReferenceDate"]
        existing.append(rec)
        added += 1

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    print(f"갱신 {updated}건, 신규 {added}건 → 총 {len(existing)} 저장: {OUT_JSON}")


if __name__ == "__main__":
    main()
