#!/usr/bin/env python3
"""
서대문구 GDMS 물품판매소 지도(main.asp)에서 종량제·음식물·업소 봉투 등(일반 계열)과
PP마대(특수·불연성 마대로 간주) 판매처를 수집해 stores.sample.json 에 반영합니다.

원본: POST http://210.91.18.253/gdms_maps/main.asp
      site=0223, dong=<행정동코드>, item=<물품코드>

- hasTrashBag: 필증·업소·음식물봉투·규격봉투·재사용(1120, 2xxx, 3xxx, 5xxx, 6xxx)
- hasSpecialBag: pp마대10/20ℓ (7010, 7020)

getD 는 노원과 달리 "상호/주소/YYYY-MM-DD" 3필드(전화번호 없음).

.env.local: KAKAO_REST_API_KEY (또는 KAKAO_REST_KEY)

사용 예:
  python3 scripts/import_seodaemun_gdms.py --dry-run
  python3 scripts/import_seodaemun_gdms.py --out public/data/seodaemun-gdms-import.json
  python3 scripts/import_seodaemun_gdms.py --merge-into public/data/stores.sample.json
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

BASE_URL = "http://210.91.18.253/gdms_maps/main.asp"
SITE_CODE = "0223"
FRONTEND = Path(__file__).resolve().parent.parent
DEFAULT_OUT = FRONTEND / "public" / "data" / "seodaemun-gdms-import.json"
DEFAULT_MERGE = FRONTEND / "public" / "data" / "stores.sample.json"
CACHE_GEO = Path(__file__).resolve().parent / "geocode-cache-seodaemun-gdms.json"

DONG_CODES = [
    "101",
    "201",
    "301",
    "401",
    "501",
    "601",
    "602",
    "603",
    "701",
    "702",
    "801",
    "802",
    "901",
    "902",
    "999",
]

# 일반 종량제·음식물·업소·재사용(마대 제외)
TRASH_ITEM_CODES = frozenset(
    {
        "1120",
        "2005",
        "2010",
        "2020",
        "2025",
        "2120",
        "3001",
        "3002",
        "3003",
        "3005",
        "3010",
        "3020",
        "5002",
        "5003",
        "5005",
        "5010",
        "5020",
        "5050",
        "5075",
        "6010",
        "6020",
    }
)
SPECIAL_ITEM_CODES = frozenset({"7010", "7020"})

GETD_RE = re.compile(
    r"""name=["']getD["'][^>]*value=[']([\s\S]*?)[']\s*>""",
    re.IGNORECASE,
)
DATE_TAIL_RE = re.compile(r"/(\d{4}-\d{2}-\d{2})\s*$")


def _load_dotenv_local():
    p = FRONTEND / ".env.local"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


_load_dotenv_local()
KAKAO_KEY = (
    os.environ.get("KAKAO_REST_KEY", "").strip()
    or os.environ.get("KAKAO_REST_API_KEY", "").strip()
)
GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
GEOCODE_DELAY = 0.07
DISTRICT_LABEL = "서대문구"


def norm_store_name(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").strip().lower())
    return f"{norm_store_name(name).lower()}|{a}"


def to_full_road(addr: str) -> str:
    addr = re.sub(r"\s+", " ", (addr or "").strip())
    if not addr:
        return addr
    if addr.startswith("서울"):
        return addr
    if addr.startswith("서대문구"):
        return "서울특별시 " + addr
    return "서울특별시 서대문구 " + addr


def fetch_post(dong: str, item: str) -> str:
    body = urllib.parse.urlencode(
        {"site": SITE_CODE, "dong": dong, "item": item}
    ).encode("ascii")
    req = urllib.request.Request(
        BASE_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Mozilla/5.0 (compatible; vinyl-data-import/1.0)",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        raw = resp.read()
    try:
        return raw.decode("euc-kr")
    except UnicodeDecodeError:
        return raw.decode("euc-kr", errors="replace")


def parse_getd(html: str) -> str:
    m = GETD_RE.search(html)
    return (m.group(1) if m else "").strip()


def parse_row_line(line: str) -> tuple[str, str, str] | None:
    """상호 / 주소(슬래시 포함 가능) / YYYY-MM-DD"""
    line = line.strip()
    if not line:
        return None
    dm = DATE_TAIL_RE.search(line)
    if not dm:
        return None
    ref_date = dm.group(1)
    head = line[: dm.start()]
    idx = head.find("/")
    if idx < 0:
        return None
    name, addr = head[:idx].strip(), head[idx + 1 :].strip()
    if not name or not addr:
        return None
    return name, addr, ref_date


def scrape_flags() -> dict[str, dict]:
    """norm_key → { name, roadAddress, address, hasTrashBag, hasSpecialBag, dataReferenceDate }"""
    agg: dict[str, dict] = {}
    all_codes = sorted(TRASH_ITEM_CODES | SPECIAL_ITEM_CODES)
    n = len(DONG_CODES) * len(all_codes)
    done = 0
    for dong in DONG_CODES:
        for item_code in all_codes:
            done += 1
            is_trash = item_code in TRASH_ITEM_CODES
            is_special = item_code in SPECIAL_ITEM_CODES
            try:
                html = fetch_post(dong, item_code)
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
                print(f"  요청 실패 dong={dong} item={item_code}: {e}", file=sys.stderr)
                continue
            blob = parse_getd(html)
            for raw in blob.splitlines():
                parsed = parse_row_line(raw)
                if not parsed:
                    continue
                name, addr, ref_date = parsed
                road = to_full_road(addr)
                k = norm_key(name, road)
                if k not in agg:
                    agg[k] = {
                        "name": name,
                        "roadAddress": road,
                        "address": road,
                        "hasTrashBag": False,
                        "hasSpecialBag": False,
                        "dataReferenceDate": ref_date,
                    }
                rec = agg[k]
                if is_trash:
                    rec["hasTrashBag"] = True
                if is_special:
                    rec["hasSpecialBag"] = True
                old = rec.get("dataReferenceDate") or ""
                if ref_date and (not old or ref_date > old):
                    rec["dataReferenceDate"] = ref_date
            time.sleep(0.12)
            if done % 50 == 0:
                print(f"  … 스크랩 진행 {done}/{n}", file=sys.stderr)
    return agg


def to_float(val):
    if val is None:
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (ValueError, TypeError):
        return None


def load_cache() -> dict:
    if CACHE_GEO.exists():
        return json.loads(CACHE_GEO.read_text(encoding="utf-8"))
    return {}


def save_cache(c: dict) -> None:
    CACHE_GEO.write_text(json.dumps(c, ensure_ascii=False), encoding="utf-8")


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


def kakao_keyword_geocode(query: str, cache: dict) -> tuple[float, float] | None:
    if not KAKAO_KEY:
        return None
    h = hashlib.sha256(("kw:" + query).encode("utf-8")).hexdigest()[:16]
    if h in cache:
        lat, lng = cache[h]
        return float(lat), float(lng)
    q2 = urllib.parse.urlencode({"query": query, "size": "1"})
    r = urllib.request.Request(
        f"{KEYWORD_URL}?{q2}", headers={"Authorization": f"KakaoAK {KAKAO_KEY}"}
    )
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
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


def kakao_geocode(address: str, cache: dict) -> tuple[float, float] | None:
    if not KAKAO_KEY:
        return None
    h = hashlib.sha256(address.encode("utf-8")).hexdigest()[:16]
    if h in cache:
        lat, lng = cache[h]
        return float(lat), float(lng)
    q = urllib.parse.urlencode({"query": address})
    r = urllib.request.Request(
        f"{GEOCODE_URL}?{q}", headers={"Authorization": f"KakaoAK {KAKAO_KEY}"}
    )
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
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
    q2 = urllib.parse.urlencode({"query": address, "size": "1"})
    r2 = urllib.request.Request(
        f"{KEYWORD_URL}?{q2}", headers={"Authorization": f"KakaoAK {KAKAO_KEY}"}
    )
    try:
        with urllib.request.urlopen(r2, timeout=10) as resp:
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


def resolve_coords(row: dict, cache: dict) -> tuple[float, float] | None:
    road = row["roadAddress"]
    name = row["name"]
    for qv in geocode_query_variants(road):
        c = kakao_geocode(qv, cache)
        if c:
            return c
    c = kakao_geocode(f"{road} {name}", cache)
    if c:
        return c
    for qv in geocode_query_variants(road):
        c = kakao_keyword_geocode(qv, cache)
        if c:
            return c
    for q in (f"{DISTRICT_LABEL} {name}", name, f"서울 {DISTRICT_LABEL} {name}"):
        c = kakao_keyword_geocode(q, cache)
        if c:
            return c
    return None


def in_seodaemun_bbox(lat: float, lng: float) -> bool:
    return 37.54 <= lat <= 37.60 and 126.90 <= lng <= 127.00


def merge_into_existing(incoming: list[dict], merge_path: Path) -> None:
    with open(merge_path, "r", encoding="utf-8") as f:
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
    added = updated = 0
    for s in incoming:
        if s.get("lat") is None or s.get("lng") is None:
            continue
        if not in_seodaemun_bbox(float(s["lat"]), float(s["lng"])):
            continue
        k0 = norm_key(s["name"], s["roadAddress"])
        if k0 in exist_keys:
            for e in existing:
                if norm_key(e.get("name", ""), e.get("roadAddress") or e.get("address", "")) != k0:
                    continue
                if s.get("hasSpecialBag"):
                    e["hasSpecialBag"] = True
                if s.get("hasTrashBag"):
                    e["hasTrashBag"] = True
                if s.get("dataReferenceDate"):
                    od = e.get("dataReferenceDate") or ""
                    if not od or s["dataReferenceDate"] > od:
                        e["dataReferenceDate"] = s["dataReferenceDate"]
                updated += 1
                break
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
            "businessStatus": "영업",
            "hasTrashBag": bool(s.get("hasTrashBag")),
            "hasSpecialBag": bool(s.get("hasSpecialBag")),
            "hasLargeWasteSticker": False,
            "adminVerified": False,
        }
        if s.get("dataReferenceDate"):
            rec["dataReferenceDate"] = s["dataReferenceDate"]
        existing.append(rec)
        added += 1
    merge_path.parent.mkdir(parents=True, exist_ok=True)
    with open(merge_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)
    print(f"병합 완료: 신규 {added}건, 기존 갱신 {updated}건 → {merge_path}")


def main() -> None:
    ap = argparse.ArgumentParser(description="서대문구 GDMS → StoreData JSON / 병합")
    ap.add_argument("--dry-run", action="store_true", help="스크랩만 하고 JSON 저장 안 함")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="수집 결과 JSON")
    ap.add_argument(
        "--merge-into",
        type=Path,
        default=None,
        help="stores.sample.json 등에 병합",
    )
    ap.add_argument(
        "--skip-geocode",
        action="store_true",
        help="지오코딩 생략(좌표 없는 행은 출력·병합에서 제외)",
    )
    args = ap.parse_args()

    print("서대문구 GDMS 판매처 수집 중…", file=sys.stderr)
    agg = scrape_flags()
    rows = list(agg.values())
    trash_n = sum(1 for r in rows if r.get("hasTrashBag"))
    spec_n = sum(1 for r in rows if r.get("hasSpecialBag"))
    both = sum(1 for r in rows if r.get("hasTrashBag") and r.get("hasSpecialBag"))
    print(
        f"  고유 판매처 {len(rows)}건 (종량제계열 {trash_n}, PP마대 {spec_n}, 둘 다 {both})",
        file=sys.stderr,
    )

    if args.dry_run:
        for r in rows[:20]:
            flags = []
            if r.get("hasTrashBag"):
                flags.append("봉투")
            if r.get("hasSpecialBag"):
                flags.append("마대")
            print(f"  [{'·'.join(flags)}] {r['name']} | {r['roadAddress']}")
        if len(rows) > 20:
            print(f"  … 외 {len(rows) - 20}건")
        print("(dry-run 종료)")
        return

    cache = load_cache()
    if not args.skip_geocode:
        if not KAKAO_KEY:
            print(
                "KAKAO_REST_API_KEY 가 없어 지오코딩 불가. --skip-geocode 또는 키 설정.",
                file=sys.stderr,
            )
            raise SystemExit(1)
        print(f"지오코딩 {len(rows)}건…", file=sys.stderr)
        for i, r in enumerate(rows):
            coords = resolve_coords(r, cache)
            if coords:
                r["lat"], r["lng"] = coords
            if (i + 1) % 50 == 0:
                save_cache(cache)
                print(f"  … {i + 1}/{len(rows)}", file=sys.stderr)
        save_cache(cache)
    else:
        for r in rows:
            r["lat"], r["lng"] = None, None

    out_rows = [
        {
            **r,
            "businessStatus": "영업",
            "adminVerified": False,
            "hasLargeWasteSticker": False,
        }
        for r in rows
        if r.get("lat") is not None and r.get("lng") is not None
    ]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out.expanduser().resolve(), "w", encoding="utf-8") as f:
        json.dump(out_rows, f, ensure_ascii=False, indent=2)
    print(f"저장: {args.out} ({len(out_rows)}건, 좌표 실패 {len(rows) - len(out_rows)}건)")

    if args.merge_into:
        merge_into_existing(out_rows, args.merge_into.expanduser().resolve())


if __name__ == "__main__":
    main()
