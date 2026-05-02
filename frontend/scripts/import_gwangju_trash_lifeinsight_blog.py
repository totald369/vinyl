#!/usr/bin/env python3
"""
광주광역시 종량제봉투 판매처 — lifeinsightspost.com 글 표 + (선택) 구별 공식 CSV(cp949).

블로그(HTML 내 5개 표): 광산·북구는 전량, 남·동·서는 글 속 표 행수가 매우 적을 수 있습니다.
공식 「연번, 판매소명, 전화번호, 도로명주소」 CSV는 여러 번 --csv 로 넘기면 블로그와 통합합니다.
동일 매장 추정 시 CSV가 우선합니다.

플래그: 목록 원천상 종량제 판매소 → hasTrashBag True. 블로그 4열(대형폐기물 스티커)에
「판매/가능/있음/Y/O」 등이 있으면 hasLargeWasteSticker True. 불연성은 데이터 없음 → False.

  python3 scripts/import_gwangju_trash_lifeinsight_blog.py \\
    --csv \"$HOME/Downloads/광주광역시_서구_종량제봉투판매업소현황_20260320.csv\"

필요: .env.local KAKAO_REST_KEY (좌표)
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html as htmlmod
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
OUT_JSON = FRONTEND / "public" / "data" / "stores.gwangju-trash-lifeinsights.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-gwangju-trash.json"

BLOG_URL = "https://lifeinsightspost.com/%EA%B4%91%EC%A3%BC%EA%B4%91%EC%97%AD%EC%8B%9C-%EC%A2%85%EB%9F%89%EC%A0%9C%EB%B4%89%ED%88%AC-%ED%8C%90%EB%A7%A4%EC%B2%98/"

USER_AGENT = "Mozilla/5.0 (compatible; VinylMapBlogImport/1.0)"
GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
GEOCODE_DELAY = 0.06

GU_LABEL = re.compile(r"광주광역시\s*(광산구|동구|서구|남구|북구)")


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


def collapse(s: str) -> str:
    s = (s or "").replace("\xa0", " ").replace("\u200b", "")
    return re.sub(r"\s+", " ", s).strip()


def to_float(val):
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
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
        with urllib.request.urlopen(r, timeout=15) as resp:
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
            with urllib.request.urlopen(r, timeout=15) as resp:
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

    coords = req(f"{GEOCODE_URL}?{urllib.parse.urlencode({'query': address})}")
    if not coords:
        q2 = urllib.parse.urlencode({"query": address, "size": "1"})
        coords = req(f"{KEYWORD_URL}?{q2}")
    if coords:
        cache[h] = list(coords)
        time.sleep(GEOCODE_DELAY)
        return coords
    time.sleep(GEOCODE_DELAY)
    return None


def resolve_coords(addr: str, name: str, cache: dict, key: str) -> tuple[float, float] | None:
    a = collapse(addr)
    if not a:
        return None
    c = kakao_geocode(a, cache, key)
    if c:
        return c
    return kakao_keyword_geocode(f"{a} {name}", cache, key) or kakao_keyword_geocode(
        f"{name} 광주", cache, key
    )


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.read().decode("utf-8", "replace")


def extract_modified_date(html_txt: str) -> str | None:
    m = re.search(
        r'property="article:modified_time"\s+content="([^"]+)"',
        html_txt,
    )
    if m:
        iso = m.group(1).strip()
        if "T" in iso:
            return iso.split("T", 1)[0]
        return iso[:10]
    return None


def strip_td(cell: str) -> str:
    t = re.sub(r"<[^>]+>", " ", cell)
    t = htmlmod.unescape(t)
    return collapse(t)


def parse_html_tables(html_txt: str) -> list[list[str]]:
    m = re.search(
        r'class="[^"]*entry-content[^"]*"[\s\S]*?>([\s\S]*?)<footer[\s\S]*?</footer>',
        html_txt,
        re.I,
    )
    chunk = m.group(1) if m else html_txt
    tbls = re.findall(r"<table[^>]*>([\s\S]*?)</table>", chunk, re.I)
    rows_out: list[list[str]] = []
    for tbl in tbls:
        for tr in re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", tbl, re.I):
            cells = re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", tr, re.I)
            vals = [strip_td(c) for c in cells if strip_td(c)]
            if not vals:
                continue
            if vals[0] == "판매처명":
                continue
            if len(vals) < 3:
                continue
            rows_out.append(vals)
    return rows_out


def normalize_phone(cell: str) -> str:
    s = collapse(cell)
    tm = re.search(r"tel:([0-9\-]{8,})", s.replace(" ", ""), re.I)
    if tm:
        s = tm.group(1)
    if "데이터" in s and "미수집" in s:
        return ""
    digits = re.sub(r"\D", "", s)
    if not digits:
        return ""
    if len(digits) == 11 and digits.startswith(("062", "063", "010", "070")):
        if digits.startswith("062"):
            return f"062-{digits[3:7]}-{digits[7:]}"
        if digits.startswith("063"):
            return f"063-{digits[3:7]}-{digits[7:]}"
    if len(digits) == 10 and digits.startswith(("062", "063")):
        return f"{digits[:3]}-{digits[3:7]}-{digits[7:]}"
    if re.match(r"^062-\d{3,4}-\d{4}$", s):
        return s
    if re.match(r"^063-\d{3,4}-\d{4}$", s):
        return s
    if re.match(r"^070-\d{4}-\d{4}$", s):
        return s
    return collapse(s[:40])


def sticker_yes(cell: str) -> bool:
    sl = collapse(cell).replace("–", "-").replace("—", "-")
    if not sl or sl in {"-", "미수급"}:
        return False
    lc = sl.lower()
    nl = lc.replace(" ", "")
    neg = ("미판매", "판매불가", "불판매", "판매 불가", "불가", "판매안함")
    if any(n in nl for n in ("미판매", "판매불가", "불판매", "불가판매")) or any(n in lc for n in neg):
        return False
    if any(x in lc for x in ("판매", "가능", "있", "예", "o", "y")):
        return True
    if re.fullmatch(r"[✓●○〇◯]", sl):
        return True
    return False


def row_from_blog_cells(vals: list[str], pri: int) -> dict | None:
    name = vals[0]
    addr = vals[1]
    phone_raw = vals[2] if len(vals) > 2 else ""
    stk_raw = vals[3] if len(vals) > 3 else ""
    road = collapse(addr)
    nm = collapse(name)
    if not road or not nm or "광주광역시" not in road:
        return None
    mgu = GU_LABEL.search(road)
    gu_tag = mgu.group(1) if mgu else "unknown"
    return {
        "_pri": pri,
        "name": nm,
        "roadAddress": road,
        "_phone_raw": normalize_phone(phone_raw),
        "hasTrashBag": True,
        "hasSpecialBag": False,
        "hasLargeWasteSticker": sticker_yes(stk_raw),
        "source": "blog_html",
        "gwangjuGu": gu_tag,
    }


def read_csv_cp949(path: Path, pri: int) -> list[dict]:
    out: list[dict] = []
    with open(path, "r", encoding="cp949", newline="") as f:
        rdr = csv.reader(f)
        for row in rdr:
            if not row or row[0] == "연번":
                continue
            if len(row) < 4:
                continue
            _seq, nm, tel, addr = row[0].strip(), row[1], row[2], row[3]
            road = collapse(addr)
            if not road:
                continue
            mgu = GU_LABEL.search(road)
            gu_tag = mgu.group(1) if mgu else "unknown"
            out.append(
                {
                    "_pri": pri,
                    "name": collapse(nm),
                    "roadAddress": road,
                    "_phone_raw": normalize_phone(collapse(tel)),
                    "hasTrashBag": True,
                    "hasSpecialBag": False,
                    "hasLargeWasteSticker": False,
                    "source": "csv_" + path.stem[:40],
                    "gwangjuGu": gu_tag,
                }
            )
    return out


def merge_key(rec: dict) -> str:
    def norm(s: str) -> str:
        return re.sub(r"\s+", " ", (s or "").lower().strip())

    return f"{norm(rec['name'])}|{norm(rec['roadAddress'])}"


def merged_records(blog_rows: list[dict], csv_rows: list[dict]) -> list[dict]:
    bucket: dict[str, dict] = {}
    for rec in sorted(
        blog_rows + csv_rows,
        key=lambda x: (-x["_pri"], x["roadAddress"]),
    ):
        k = merge_key(rec)
        if k not in bucket:
            bucket[k] = rec
    return list(bucket.values())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=BLOG_URL, help="블로그 글 URL")
    ap.add_argument(
        "--csv",
        dest="csv_paths",
        type=Path,
        action="append",
        default=[],
        help="cp949 행안부형 CSV (연번,판매소명,전화번호,도로명주소) — 여러 번 지정 가능",
    )
    ap.add_argument(
        "--ref-date",
        type=str,
        default="",
        help="dataReferenceDate YYYY-MM-DD (기본: 글 modified 메타 또는 오늘)",
    )
    args = ap.parse_args()

    csv_files = list(args.csv_paths)

    sug = Path.home() / "Downloads" / "광주광역시_서구_종량제봉투판매업소현황_20260320.csv"
    if sug.exists() and sug not in csv_files:
        csv_files.insert(0, sug)
        print(f"자동 CSV 포함: {sug}", file=sys.stderr)

    print(f"블로그 수집 {args.url}", file=sys.stderr)
    html_txt = fetch_html(args.url)
    ref = args.ref_date.strip() or extract_modified_date(html_txt)
    if not ref:
        from datetime import date

        ref = date.today().isoformat()

    tbl = parse_html_tables(html_txt)
    blog_recs = []
    pri_blog = 10
    pri_csv = 100
    seen_dup = set()
    for vals in tbl:
        r = row_from_blog_cells(vals, pri_blog)
        if r:
            blog_recs.append(r)

    csv_recs_all: list[dict] = []
    for cf in csv_files:
        if not cf.expanduser().exists():
            print(f"CSV 없음(건너뜀): {cf}", file=sys.stderr)
            continue
        p = cf.expanduser()
        part = read_csv_cp949(p, pri_csv)
        print(f"CSV {len(part)}건 {p.name}", file=sys.stderr)
        csv_recs_all.extend(part)

    merged = merged_records(blog_recs, csv_recs_all)
    print(f"병합키 후 {len(merged)}건 (블로그 {len(blog_recs)} + CSV합 {len(csv_recs_all)})", file=sys.stderr)

    cache = load_cache()
    if not KAKAO_REST_KEY:
        print("KAKAO_REST_KEY 없음.", file=sys.stderr)

    merged.sort(key=lambda x: (x.get("gwangjuGu", ""), x["roadAddress"], x["name"]))
    stores: list[dict] = []
    failed = 0

    for i, rec in enumerate(merged):
        road = rec["roadAddress"]
        name = rec["name"]
        oid = f"gwangju-trash-lifeinsights-{i + 1:05d}"

        lat = lng = None
        if KAKAO_REST_KEY:
            c = resolve_coords(road, name, cache, KAKAO_REST_KEY)
            if c:
                lat, lng = c

        obj: dict = {
            "id": oid,
            "name": name,
            "roadAddress": road,
            "address": road,
            "businessStatus": "영업",
            "hasTrashBag": True,
            "hasSpecialBag": False,
            "hasLargeWasteSticker": rec["hasLargeWasteSticker"],
            "adminVerified": False,
            "dataReferenceDate": ref,
            "sourceVendor": rec.get("source", ""),
            "gwangjuGu": rec.get("gwangjuGu"),
        }

        ph = rec.get("_phone_raw") or ""
        if ph:
            obj["phone"] = ph

        if lat is not None and lng is not None:
            obj["lat"] = lat
            obj["lng"] = lng
        else:
            failed += 1

        stores.append(obj)
        if (i + 1) % 100 == 0:
            save_cache(cache)
            print(f"  지오코드 {i+1}/{len(merged)} 실패 누적 {failed}", file=sys.stderr)

    save_cache(cache)
    ok = sum(1 for s in stores if "lat" in s)
    print(f"좌표 {ok}/{len(stores)} 실패 {failed}", file=sys.stderr)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(stores, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"저장 {OUT_JSON}", file=sys.stderr)


if __name__ == "__main__":
    main()
