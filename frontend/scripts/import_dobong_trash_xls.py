#!/usr/bin/env python3
"""
도봉구 종량제봉투 지정판매소 .xls(백승·경원·경일 등) → stores.sample.json 병합.
- 파일명 _202404 → dataReferenceDate 2024-04-01
- 주소 '서울 도봉구' → '서울특별시 도봉구' 로 정규화 후 카카오 지오코딩

의존: pip install 'xlrd==1.2.0'  (.xls 전용, xlrd 2.x 는 .xls 미지원)

사용:
  .env.local 의 KAKAO_REST_API_KEY
  python3 scripts/import_dobong_trash_xls.py
  python3 scripts/import_dobong_trash_xls.py /path/to/....xls ...
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

try:
    import xlrd
except ImportError as e:
    print("xlrd 가 필요합니다: pip install 'xlrd==1.2.0'", file=sys.stderr)
    raise SystemExit(1) from e

DOWNLOADS = Path.home() / "Downloads"
FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.sample.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-dobong.json"


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
    """저장 주소는 그대로 두고, 지오코딩만 보조 문자열을 씀 (norm_key 불일치 방지)."""
    ex: list[str] = []
    if re.search(r"[가-힣]+로\d{2,}", road):
        ex.append(re.sub(r"([가-힣]+로)(\d{2,})", r"\1 \2", road))
    if re.search(r"[가-힣]+길\d{2,}", road):
        ex.append(re.sub(r"([가-힣]+길)(\d{2,})", r"\1 \2", road))
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
    if not a:
        return a
    if a.startswith("서울특별시"):
        return a
    if a.startswith("서울 "):
        return "서울특별시" + a[2:]
    if a.startswith("도봉구"):
        return "서울특별시 " + a
    return "서울특별시 도봉구 " + a


def ref_date_from_filename(path: Path) -> str | None:
    m = re.search(r"_(\d{6})", path.name)
    if m:
        y, mo = m.group(1)[:4], m.group(1)[4:6]
        return f"{y}-{mo}-01"
    return None


def cell_str(sh: "xlrd.sheet.Sheet", r: int, c: int) -> str:
    v = sh.cell_value(r, c)
    if v is None or v == "":
        return ""
    if isinstance(v, float) and abs(v - round(v)) < 1e-9 and 1e3 < abs(v) < 1e15:
        pass
    if isinstance(v, float) and v == int(v) and -1e10 < v < 1e10:
        if abs(v) < 1e6:
            return str(int(v))
    return str(v).strip()


def find_header_row(sh: "xlrd.sheet.Sheet") -> tuple[int, int, int]:
    for r in range(min(25, sh.nrows)):
        cells = [cell_str(sh, r, c) for c in range(sh.ncols)]
        joined = " ".join(cells)
        if "주소" not in joined:
            continue
        if not any(k in joined for k in ("상호", "업소", "판매")):
            continue
        i_name = i_addr = None
        for c, v in enumerate(cells):
            if "주소" in v:
                i_addr = c
            if "상호명" in v or ("상호" in v and "전화" not in v and len(v) <= 6):
                i_name = c
        if i_name is None:
            for c, v in enumerate(cells):
                if "상호" in v or "업소명" in v:
                    i_name = c
                    break
        if i_name is not None and i_addr is not None:
            return r, i_name, i_addr
    raise ValueError(f"헤더 행을 찾지 못했습니다: {sh.name}")


def parse_xls(path: Path) -> list[dict]:
    wb = xlrd.open_workbook(str(path))
    sh = wb.sheet_by_index(0)
    hr, ic_name, ic_addr = find_header_row(sh)
    ref = ref_date_from_filename(path)
    out: list[dict] = []
    for r in range(hr + 1, sh.nrows):
        name = cell_str(sh, r, ic_name)
        addr = cell_str(sh, r, ic_addr)
        if not name or not addr:
            continue
        low = name.lower()
        if low in ("상호", "상호명", "nan") or "상호" == name:
            continue
        road = normalize_seoul_dobong_addr(addr)
        out.append(
            {
                "name": norm_store_name(name),
                "roadAddress": road,
                "address": road,
                "businessStatus": "영업",
                "hasTrashBag": True,
                "hasSpecialBag": False,
                "hasLargeWasteSticker": False,
                "adminVerified": False,
                "dataReferenceDate": ref,
                "_source_file": path.name,
            }
        )
    return out


def discover_paths(argv: list[str]) -> list[Path]:
    if argv:
        return [Path(a).expanduser().resolve() for a in argv]
    paths = sorted(DOWNLOADS.glob("봉투판매소현황_*.xls"))
    return [p.resolve() for p in paths if p.is_file()]


def main():
    if not KAKAO_REST_KEY:
        print("KAKAO_REST_KEY 또는 KAKAO_REST_API_KEY 가 필요합니다.")
        raise SystemExit(1)

    paths = discover_paths(sys.argv[1:])
    if not paths:
        print("인자로 .xls 경로를 주거나 Downloads 에 봉투판매소현황_*.xls 를 두세요.")
        raise SystemExit(1)

    raw: list[dict] = []
    for p in paths:
        if not p.exists():
            print(f"건너뜀 (없음): {p}")
            continue
        try:
            part = parse_xls(p)
        except Exception as e:
            print(f"파싱 실패 {p.name}: {e}", file=sys.stderr)
            continue
        print(f"  {p.name}: {len(part)}건")
        raw.extend(part)

    by_key: dict[str, dict] = {}
    for s in raw:
        k0 = norm_key(s["name"], s["roadAddress"])
        if k0 not in by_key:
            by_key[k0] = s
        else:
            prev = by_key[k0]
            rd = prev.get("dataReferenceDate")
            sd = s.get("dataReferenceDate")
            if sd and (not rd or sd > rd):
                prev["dataReferenceDate"] = sd

    unique = list(by_key.values())
    print(f"중복 제거 후 {len(unique)}건")

    cache = load_cache()
    geocode_failed: list[str] = []
    print("지오코딩 중…")
    for i, s in enumerate(unique):
        coords = resolve_coords_dobong(
            s["roadAddress"], s["name"], cache, KAKAO_REST_KEY
        )
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
        print(f"좌표 실패 {len(geocode_failed)}건 (일부): {geocode_failed[:15]}")

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
        s.pop("_source_file", None)
        k0 = norm_key(s["name"], s["roadAddress"])
        if k0 in exist_keys:
            for e in existing:
                if norm_key(e.get("name", ""), e.get("roadAddress") or e.get("address", "")) != k0:
                    continue
                ch = False
                nt = bool(e.get("hasTrashBag")) or s["hasTrashBag"]
                if nt != bool(e.get("hasTrashBag")):
                    ch = True
                e["hasTrashBag"] = nt
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
            "hasSpecialBag": bool(s.get("hasSpecialBag")),
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
