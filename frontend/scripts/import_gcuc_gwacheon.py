#!/usr/bin/env python3
"""
과천도시공사 판매소현황 HTML → stores.sample.json 병합.

원본: https://www.gcuc.or.kr/fmcs/266
표: 동별 탭(vol1~vol6) 테이블 — 순번, 거래처명, 매장전화, 주소

- 종량제봉투 + 대형폐기물 스티커 판매소 안내 페이지이므로
  hasTrashBag·hasLargeWasteSticker True, hasSpecialBag False
- 주소에 '과천시' 없으면 스킵(관외 등)
- 카카오 주소/키워드 검색으로 좌표 (.env.local 의 KAKAO_REST_API_KEY)

사용:
  python3 scripts/import_gcuc_gwacheon.py --dry-run
  python3 scripts/import_gcuc_gwacheon.py
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

PAGE_URL = "https://www.gcuc.or.kr/fmcs/266"
FRONTEND = Path(__file__).resolve().parent.parent
DEFAULT_MERGE = FRONTEND / "public" / "data" / "stores.sample.json"
DEFAULT_OUT = FRONTEND / "public" / "data" / "gwacheon-gcuc-import.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-gwacheon.json"


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
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
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


def kakao_geocode(address: str, cache: dict, key: str) -> tuple[float, float] | None:
    h = hashlib.sha256(address.encode("utf-8")).hexdigest()[:16]
    if h in cache:
        lat, lng = cache[h]
        return float(lat), float(lng)

    def req(url: str) -> tuple[float, float] | None:
        r = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {key}"})
        try:
            with urllib.request.urlopen(r, timeout=10) as resp:
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
    return seen


def normalize_gwacheon_address(addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").strip())
    if not a:
        return a
    a = re.sub(r"^경기\s+과천시", "경기도 과천시", a)
    if a.startswith("과천시"):
        return "경기도 " + a
    if not a.startswith("경기"):
        return f"경기도 과천시 {a}"
    return a


def clean_store_name(name: str) -> str:
    s = (name or "").strip()
    s = re.sub(r"\(태그\)", "", s, flags=re.I)
    s = re.sub(r"\[\s*[^]]*태그[^\]]*\]", "", s)
    s = re.sub(r"\[\s*\d+단지[^\]]*\]", "", s)
    s = re.sub(r"\[\s*[^:\]]+:[^\]]+\]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def norm_store_name(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").strip().lower())
    return f"{norm_store_name(name).lower()}|{a}"


def parse_table_rows(html: str) -> list[dict]:
    """m_table 블록에서 (동명, 순번, 상호, 전화, 주소) 추출."""
    rows: list[dict] = []
    pat = re.compile(r'<div class="m_table[^"]*"[^>]*id="(vol\d+)"', re.I)
    starts = [m.start() for m in pat.finditer(html)]
    for i, st in enumerate(starts):
        en = starts[i + 1] if i + 1 < len(starts) else len(html)
        block = html[st:en]
        cap = re.search(r"판매소현황\(([^)]+)\)", block)
        dong = (cap.group(1) or "").strip() if cap else ""
        for tr in re.finditer(r"<tr[^>]*>(.*?)</tr>", block, re.DOTALL | re.IGNORECASE):
            inner = tr.group(1)
            cells = re.findall(r"<t[hd][^>]*>([^<]*)</t[hd]>", inner, re.IGNORECASE)
            if len(cells) != 4:
                continue
            seq, name, phone, addr = [c.strip() for c in cells]
            if seq in ("순번", "") or name in ("거래처명", ""):
                continue
            if not name or not addr:
                continue
            addr_n = normalize_gwacheon_address(addr)
            if "과천시" not in addr_n:
                continue
            if "관외" in addr_n or "안양시" in addr_n or "서울특별시" in addr_n:
                continue
            rows.append(
                {
                    "dong": dong,
                    "seq": seq,
                    "name": clean_store_name(name),
                    "phone": phone if phone and phone != "-" else "",
                    "roadAddress": addr_n,
                }
            )
    return rows


def fetch_html(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; vinyl-data-import/1.0)"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


def in_gwacheon_bbox(lat: float, lng: float) -> bool:
    return 37.35 <= lat <= 37.50 and 126.95 <= lng <= 127.08


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
    for q in (
        f"경기도 과천시 {place_name}",
        f"과천시 {place_name}",
        place_name,
    ):
        c = kakao_keyword_geocode(q, cache, key)
        if c:
            return c
    return None


def merge_into_existing(
    incoming: list[dict],
    merge_path: Path,
) -> tuple[int, int]:
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
        try:
            la, ln = float(s["lat"]), float(s["lng"])
        except (TypeError, ValueError):
            continue
        if not in_gwacheon_bbox(la, ln):
            continue
        k0 = norm_key(s["name"], s["roadAddress"])
        if k0 in exist_keys:
            for e in existing:
                if norm_key(e.get("name", ""), e.get("roadAddress") or e.get("address", "")) != k0:
                    continue
                ch = False
                if s.get("hasSpecialBag") and not e.get("hasSpecialBag"):
                    e["hasSpecialBag"] = True
                    ch = True
                if s.get("hasTrashBag") and not e.get("hasTrashBag"):
                    e["hasTrashBag"] = True
                    ch = True
                if s.get("hasLargeWasteSticker") and not e.get("hasLargeWasteSticker"):
                    e["hasLargeWasteSticker"] = True
                    ch = True
                if s.get("dataReferenceDate"):
                    od = e.get("dataReferenceDate") or ""
                    nd = s["dataReferenceDate"]
                    if (not od or nd > od) and nd != od:
                        e["dataReferenceDate"] = nd
                        ch = True
                if (e.get("lat") is None or e.get("lng") is None) and s.get("lat") is not None:
                    e["lat"] = s["lat"]
                    e["lng"] = s["lng"]
                    ch = True
                if ch:
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
            "address": s.get("address") or s["roadAddress"],
            "businessStatus": "영업",
            "hasTrashBag": bool(s.get("hasTrashBag")),
            "hasSpecialBag": bool(s.get("hasSpecialBag")),
            "hasLargeWasteSticker": bool(s.get("hasLargeWasteSticker")),
            "adminVerified": False,
        }
        if s.get("dataReferenceDate"):
            rec["dataReferenceDate"] = s["dataReferenceDate"]
        existing.append(rec)
        added += 1
    merge_path.parent.mkdir(parents=True, exist_ok=True)
    with open(merge_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)
    return added, updated


def main() -> None:
    ap = argparse.ArgumentParser(description="과천 GCUC 판매소 → StoreData 병합")
    ap.add_argument("--url", default=PAGE_URL, help="판매소현황 페이지 URL")
    ap.add_argument("--merge-into", type=Path, default=DEFAULT_MERGE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--skip-geocode",
        action="store_true",
        help="지오코딩 생략(파싱·통계만)",
    )
    args = ap.parse_args()

    try:
        html = fetch_html(args.url)
    except (urllib.error.URLError, OSError) as e:
        print(f"페이지 로드 실패: {e}", file=sys.stderr)
        raise SystemExit(1)

    raw_rows = parse_table_rows(html)
    print(f"과천시 주소 행 {len(raw_rows)}건 (HTML)", file=sys.stderr)

    by_key: dict[str, dict] = {}
    for r in raw_rows:
        k0 = norm_key(r["name"], r["roadAddress"])
        if k0 not in by_key:
            by_key[k0] = r
    deduped = list(by_key.values())
    print(f"이름+주소 중복 제거 후 {len(deduped)}건", file=sys.stderr)

    ref = "2026-03-28"
    built: list[dict] = []
    for r in deduped:
        built.append(
            {
                "name": r["name"],
                "roadAddress": r["roadAddress"],
                "address": r["roadAddress"],
                "hasTrashBag": True,
                "hasSpecialBag": False,
                "hasLargeWasteSticker": True,
                "dataReferenceDate": ref,
            }
        )

    if args.dry_run or args.skip_geocode:
        for x in built[:25]:
            print(f"  {x['name']} | {x['roadAddress']}")
        if len(built) > 25:
            print(f"  … 외 {len(built) - 25}건", file=sys.stderr)
        if args.dry_run:
            return

    if not KAKAO_REST_KEY:
        print(
            "KAKAO_REST_API_KEY 없음. .env.local 설정 후 재실행하거나 --skip-geocode",
            file=sys.stderr,
        )
        raise SystemExit(1)

    cache = load_cache()
    ok = fail = 0
    for i, s in enumerate(built):
        c = resolve_coords(s["roadAddress"], s["name"], cache, KAKAO_REST_KEY)
        if c:
            s["lat"], s["lng"] = c
            ok += 1
        else:
            s["lat"] = None
            s["lng"] = None
            fail += 1
        if (i + 1) % 30 == 0:
            save_cache(cache)
            print(f"  지오코딩 … {i + 1}/{len(built)}", file=sys.stderr)
    save_cache(cache)
    print(f"지오코딩 성공 {ok}건, 실패 {fail}건", file=sys.stderr)

    with_coords = [x for x in built if x.get("lat") is not None and x.get("lng") is not None]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(
            [
                {
                    **{k: v for k, v in x.items() if k in ("name", "roadAddress", "address", "lat", "lng", "dataReferenceDate")},
                    "hasTrashBag": True,
                    "hasSpecialBag": False,
                    "hasLargeWasteSticker": True,
                    "businessStatus": "영업",
                    "adminVerified": False,
                }
                for x in with_coords
            ],
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"저장: {args.out} ({len(with_coords)}건)", file=sys.stderr)

    added, updated = merge_into_existing(with_coords, args.merge_into.expanduser().resolve())
    print(f"병합: 신규 {added}건, 기존 갱신 {updated}건 → {args.merge_into}")


if __name__ == "__main__":
    main()
