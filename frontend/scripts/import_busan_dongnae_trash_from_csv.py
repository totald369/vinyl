#!/usr/bin/env python3
"""
부산 동래구 종량제봉투 판매소 CSV → stores.busan-dongnae-trash.json
인코딩: CP949, 컬럼: 판매소,대표자,주소

  python3 scripts/import_busan_dongnae_trash_from_csv.py \\
    --csv ~/Downloads/부산광역시_동래구_종량제봉투판매소현황_20250527.csv
"""

from __future__ import annotations

import argparse
import csv
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
OUT_JSON = FRONTEND / "public" / "data" / "stores.busan-dongnae-trash.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-busan-dongnae-trash.json"

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


def sanitize_csv_address(raw: str) -> str:
    s = (raw or "").strip().strip('"').replace("\u200b", "")
    s = re.sub(r"\s+", " ", s).strip()
    if s.count("(") > s.count(")"):
        s = s + ")"
    # 「로123변길」 형태 OCR 오타 등
    s = re.sub(r"(\d)변길", r"\1번길", s)
    return s


def full_busan_dongnae_road(raw: str) -> str:
    s = sanitize_csv_address(raw)
    if not s:
        return s
    if s.startswith("부산광역시"):
        return re.sub(r"\s+", " ", s).strip()
    if s.startswith("부산시"):
        rest = s[3:].lstrip()
        s = "부산광역시 " + rest
    elif s.startswith("부산 ") and not s.startswith("부산광역시"):
        rest = s[3:].lstrip()
        s = "부산광역시 " + rest

    if s.startswith("부산광역시"):
        return re.sub(r"\s+", " ", s).strip()

    if not s.startswith("부산"):
        # 지번 등
        s = "부산광역시 " + s.lstrip()

    return re.sub(r"\s+", " ", s).strip()


def stable_id(name: str, addr: str) -> str:
    h = hashlib.sha256(f"{name}\0{addr}".encode("utf-8")).hexdigest()[:12]
    return f"busan-dongnae-trash-{h}"


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

    ro_only_dyn = re.sub(
        r"^(부산광역시\s+(?:동래구|연제구|금정구)[가-힣\d\s]*[가-힣\d\-]+(?:로|대로))\s+\d.+",
        r"\1",
        base,
    )
    if ro_only_dyn != base:
        add(ro_only_dyn, seen)
    ro_only_plain = re.sub(
        r"^(부산광역시\s+[가-힣]+\s+[가-힣\d\-]+(?:로|대로))\s+\d.+",
        r"\1",
        base,
    )
    if ro_only_plain != base:
        add(ro_only_plain, seen)
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
        base = base.strip()
        for q in (
            f"부산 동래구 {base}",
            f"동래구 {base}",
            f"부산 {base}",
            base,
        ):
            if len(q.strip()) < 2:
                continue
            c = kakao_keyword_geocode(q, cache, key)
            if c:
                return c
    return None


def ref_date_from_filename(path: Path) -> str:
    m = re.search(r"(\d{8})", path.name)
    if not m:
        return "2025-05-27"
    ds = m.group(1)
    return f"{ds[:4]}-{ds[4:6]}-{ds[6:]}"


def read_stores(csv_path: Path) -> list[tuple[str, str]]:
    """(상호명, 원문주소)"""
    out: list[tuple[str, str]] = []
    with csv_path.open(encoding="cp949", newline="") as f:
        rdr = csv.reader(f)
        header = next(rdr, None)
        if not header or len(header) < 3:
            return []
        for row in rdr:
            if len(row) < 3:
                continue
            name = (row[0] or "").strip()
            addr = (row[2] or "").strip()
            if not name or not addr:
                continue
            out.append((name, addr))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--csv",
        type=Path,
        default=Path.home()
        / "Downloads"
        / "부산광역시_동래구_종량제봉투판매소현황_20250527.csv",
        help="동래구 판매소 CSV (CP949)",
    )
    args = ap.parse_args()
    csv_path = args.csv.expanduser()
    if not csv_path.exists():
        print(f"파일 없음: {csv_path}", file=sys.stderr)
        sys.exit(1)

    ref_date = ref_date_from_filename(csv_path)

    parsed = read_stores(csv_path)
    print(f"{len(parsed)}행 파싱 · dataReferenceDate={ref_date}", file=sys.stderr)

    cache = load_cache()
    stores: list[dict] = []
    failed: list[str] = []

    if not KAKAO_REST_KEY:
        print(
            "KAKAO_REST_API_KEY 없음. 좌표 없이 저장합니다.",
            file=sys.stderr,
        )

    for i, (name, addr_raw) in enumerate(parsed):
        road = full_busan_dongnae_road(addr_raw)
        oid = stable_id(name, addr_raw)

        lat = lng = None
        if KAKAO_REST_KEY:
            c = resolve_coords(road, name, cache, KAKAO_REST_KEY)
            if c:
                lat, lng = c

        if lat is None or lng is None:
            failed.append(f"{oid} {name} | {road}")

        row: dict = {
            "id": oid,
            "name": name.strip(),
            "roadAddress": road,
            "address": road,
            "businessStatus": "영업",
            "hasTrashBag": True,
            "hasSpecialBag": False,
            "hasLargeWasteSticker": False,
            "adminVerified": False,
            "dataReferenceDate": ref_date,
        }
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
    for line in failed[:30]:
        print(f"  {line}", file=sys.stderr)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(stores, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"저장: {OUT_JSON}", file=sys.stderr)


if __name__ == "__main__":
    main()
