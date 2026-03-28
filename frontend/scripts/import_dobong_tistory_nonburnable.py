#!/usr/bin/env python3
"""
도봉구 불연성(PP) 마대 판매처 — 티스토리 글 HTML 표 파싱 → stores.sample.json
- 출처: 생활지식 블로그 글(표의 첫 <table>)
- 게시일 2024-11-23 → dataReferenceDate
- hasSpecialBag: true (앱에서 '불연성마대' 칩)
- 기존 매장은 hasTrashBag 등 기존 플래그 유지·병합

사용:
  .env.local 의 KAKAO_REST_API_KEY
  python3 scripts/import_dobong_tistory_nonburnable.py
  python3 scripts/import_dobong_tistory_nonburnable.py --local-html /path/to/saved.html
"""

from __future__ import annotations

import hashlib
import html as html_module
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.sample.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-dobong-tistory.json"

DEFAULT_URL = (
    "https://saenghwa-jisik.tistory.com/entry/"
    "%EB%8F%84%EB%B4%89%EA%B5%AC-%EB%B6%88%EC%97%B0%EC%84%B1-%EB%A7%88%EB%8C%80-pp-"
    "%ED%8C%90%EB%A7%A4%ED%95%98%EB%8A%94-%EA%B3%B3-%EC%B0%BD%EB%8F%99-%EB%B0%A9%ED%95%99%EB%8F%99-%EC%99%B8-part1"
)
REF_DATE = "2024-11-23"


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
        with urllib.request.urlopen(r, timeout=8) as resp:
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
            with urllib.request.urlopen(r, timeout=8) as resp:
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
    m = re.search(r"(면로|대로|로|길)(\d{2,4})\b", base)
    if m:
        fixed = re.sub(
            r"(면로|대로|로|길)(\d{2,4})\b",
            lambda mm: f"{mm.group(1)} {mm.group(2)}",
            base,
            count=1,
        )
        if fixed not in seen:
            seen.append(fixed)
        if "," in fixed:
            h2 = fixed.split(",")[0].strip()
            if h2 not in seen:
                seen.append(h2)
    return seen


def _geocode_extra_queries(road: str) -> list[str]:
    ex: list[str] = []
    if re.search(r"[가-힣]+로\d{2,}", road):
        ex.append(re.sub(r"([가-힣]+로)(\d{2,})", r"\1 \2", road))
    if re.search(r"[가-힣]+길\d{2,}", road):
        ex.append(re.sub(r"([가-힣]+길)(\d{2,})", r"\1 \2", road))
    for dong in ("창1동", "창2동", "창3동", "창4동", "창5동"):
        if dong in road:
            ex.append(road.replace(dong, "창동"))
    for a in (road.replace("창4동", "창동"), road.replace("창5동", "창동")):
        if a != road:
            ex.append(a)
    seen: list[str] = []
    for q in ex:
        q = re.sub(r"\s+", " ", q.strip())
        if q and q not in seen:
            seen.append(q)
    return seen


def resolve_coords_dobong(
    road_address: str,
    place_name: str,
    cache: dict,
    key: str,
) -> tuple[float, float] | None:
    queries = [road_address] + _geocode_extra_queries(road_address)
    for addr in queries:
        for qv in geocode_query_variants(addr):
            c = kakao_geocode(qv, cache, key)
            if c:
                return c
        c = kakao_geocode(f"{addr} {place_name}", cache, key)
        if c:
            return c
        for qv in geocode_query_variants(addr):
            c = kakao_keyword_geocode(qv, cache, key)
            if c:
                return c
    for q in (
        f"도봉구 {place_name}",
        f"서울특별시 도봉구 {place_name}",
        place_name,
        f"서울 {place_name}",
    ):
        c = kakao_keyword_geocode(q, cache, key)
        if c:
            return c
    return None


def normalize_seoul_dobong_addr(addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").strip())
    a = re.sub(r"\s*\.\s*", " ", a)
    if not a:
        return a
    if a.startswith("서울특별시"):
        return a
    if a.startswith("서울 "):
        return "서울특별시" + a[2:]
    if a.startswith("도봉구"):
        return "서울특별시 " + a
    return "서울특별시 도봉구 " + a


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_td = False
        self.cur: list[str] = []
        self.rows: list[list[str]] = []
        self.row: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        if tag in ("td", "th"):
            self.in_td = True
            self.cur = []

    def handle_endtag(self, tag):
        if tag in ("td", "th"):
            self.in_td = False
            text = html_module.unescape("".join(self.cur))
            text = text.replace("\xa0", " ").strip()
            text = re.sub(r"\s+", " ", text)
            self.row.append(text)
        if tag == "tr":
            if self.row and any(c.strip() for c in self.row):
                self.rows.append(self.row)

    def handle_data(self, data):
        if self.in_td:
            self.cur.append(data)


def fetch_html(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; vinyl-data-import/1.0)"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_first_table(html: str) -> list[tuple[str, str, str]]:
    m = re.search(r"<table[^>]*>.*?</table>", html, re.I | re.DOTALL)
    if not m:
        raise ValueError("HTML 에서 <table> 을 찾지 못했습니다.")
    p = TableParser()
    p.feed(m.group(0))
    out: list[tuple[str, str, str]] = []
    for row in p.rows:
        if len(row) < 3:
            continue
        name, phone, addr = row[0], row[1], row[2]
        if name in ("상호", "") or "상호" == name.strip():
            continue
        if not addr or ("도봉구" not in addr and "서울" not in addr):
            continue
        out.append((name, phone, addr))
    return out


def rows_to_stores(rows: list[tuple[str, str, str]]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for name, _phone, addr in rows:
        name = norm_store_name(name)
        road = normalize_seoul_dobong_addr(addr)
        if not name or not road:
            continue
        k = norm_key(name, road)
        if k in seen:
            continue
        seen.add(k)
        out.append(
            {
                "name": name,
                "roadAddress": road,
                "address": road,
                "businessStatus": "영업",
                "hasTrashBag": False,
                "hasSpecialBag": True,
                "hasLargeWasteSticker": False,
                "adminVerified": False,
                "dataReferenceDate": REF_DATE,
            }
        )
    return out


def main():
    dry = "--dry-run" in sys.argv
    local = None
    argv = [a for a in sys.argv[1:] if a != "--dry-run"]
    if argv and argv[0] == "--local-html" and len(argv) > 1:
        local = Path(argv[1]).expanduser().resolve()
        argv = argv[2:]

    if local and local.exists():
        html = local.read_text(encoding="utf-8", errors="replace")
        print(f"로컬 HTML: {local}")
    else:
        print(f"URL 가져오기: {DEFAULT_URL}")
        html = fetch_html(DEFAULT_URL)

    rows = parse_first_table(html)
    print(f"  표 행 {len(rows)}건 (헤더 제외)")
    stores = rows_to_stores(rows)
    print(f"  중복 제거 후 {len(stores)}건")

    if dry:
        for s in stores[:12]:
            print(f"  - {s['name']} | {s['roadAddress']}")
        if len(stores) > 12:
            print(f"  … 외 {len(stores) - 12}건")
        print("(dry-run: JSON 미저장)")
        return

    if not KAKAO_REST_KEY:
        print("KAKAO_REST_KEY 또는 KAKAO_REST_API_KEY 가 필요합니다.")
        raise SystemExit(1)

    cache = load_cache()
    geocode_failed: list[str] = []
    print("지오코딩 중…")
    for i, s in enumerate(stores):
        c = resolve_coords_dobong(s["roadAddress"], s["name"], cache, KAKAO_REST_KEY)
        if not c:
            geocode_failed.append(s["name"])
            s["lat"] = None
            s["lng"] = None
        else:
            s["lat"], s["lng"] = c
        if (i + 1) % 40 == 0:
            save_cache(cache)
            print(f"  …{i + 1}/{len(stores)}")
    save_cache(cache)

    if geocode_failed:
        print(f"좌표 실패 {len(geocode_failed)}건 (일부): {geocode_failed[:12]}")

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
    for s in stores:
        k0 = norm_key(s["name"], s["roadAddress"])
        if k0 in exist_keys:
            for e in existing:
                if norm_key(e.get("name", ""), e.get("roadAddress") or e.get("address", "")) != k0:
                    continue
                ch = False
                if not bool(e.get("hasSpecialBag")):
                    e["hasSpecialBag"] = True
                    ch = True
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
            "hasTrashBag": bool(s.get("hasTrashBag")),
            "hasSpecialBag": True,
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

    print(
        f"hasSpecialBag 병합 갱신 {updated}건, 신규 {added}건 → 총 {len(existing)} 저장: {OUT_JSON}"
    )


if __name__ == "__main__":
    main()
