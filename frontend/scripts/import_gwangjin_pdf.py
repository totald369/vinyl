#!/usr/bin/env python3
"""
광진구 2025.12 PDF(종량제 봉투 판매소 / 특수규격·불연성 마대 주요 판매소) → stores.sample.json

- 기존 JSON 에서 주소에 '광진구' 가 포함된 레코드는 제거(API 등 이전 수입분 정리) 후 PDF 데이터로 채움
- 종량제 PDF → hasTrashBag True
- 특수규격 PDF → hasSpecialBag True (불연성 마대)
- 동일 상호·주소(norm_key)는 플래그 OR 병합

사용:
  frontend/.env.local 의 KAKAO_REST_API_KEY
  python3 scripts/import_gwangjin_pdf.py
  python3 scripts/import_gwangjin_pdf.py /path/종량제.pdf /path/특수규격.pdf
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
    import fitz  # PyMuPDF
except ImportError as e:
    print("PyMuPDF(fitz) 필요: pip install pymupdf")
    raise SystemExit(1) from e

FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.sample.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-gwangjin-pdf.json"
DOWNLOADS = Path.home() / "Downloads"

DEFAULT_REGULAR = DOWNLOADS / "2025. 12. 종량제 봉투 판매소 목록.pdf"
DEFAULT_SPECIAL = DOWNLOADS / "2025. 12. 특수규격 봉투 주요 판매소 목록.pdf"

REF_DATE = "2025-12-01"

SKIP_NAMES = frozenset(
    {
        "장수환경",
        "로칼크린",
        "경동사",
        "대아",
        "㈜경동사",
    }
)

HEADER_LINES = frozenset(
    {
        "상호",
        "대행업체",
        "주소",
        "행정동명",
        "사업장 전화번호",
        "판매소",
        "10L",
        "20L",
        "행정동",
    }
)


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


def resolve_coords(
    road_address: str,
    place_name: str,
    cache: dict,
    key: str,
    extra_queries: list[str] | None = None,
) -> tuple[float, float] | None:
    queries = [road_address]
    if extra_queries:
        for eq in extra_queries:
            eq = re.sub(r"\s+", " ", (eq or "").strip())
            if eq and eq not in queries:
                queries.append(eq)
    for addr in queries:
        for qv in geocode_query_variants(addr):
            c = kakao_geocode(qv, cache, key)
            if c:
                return c
        q2 = f"{addr} {place_name}"
        c = kakao_geocode(q2, cache, key)
        if c:
            return c
        for qv in geocode_query_variants(addr):
            c = kakao_keyword_geocode(qv, cache, key)
            if c:
                return c
    for q in (
        f"광진구 {place_name}",
        place_name,
        f"서울 {place_name}",
    ):
        c = kakao_keyword_geocode(q, cache, key)
        if c:
            return c
    return None


def pdf_sorted_lines(path: Path) -> list[str]:
    """PDF 텍스트를 세로·가로 읽기 순으로 추출 (다열 표 깨짐 방지)."""
    doc = fitz.open(path)
    out: list[str] = []
    for i in range(doc.page_count):
        try:
            raw = doc[i].get_text(sort=True)
        except TypeError:
            raw = doc[i].get_text()
        for ln in raw.splitlines():
            t = ln.strip()
            if t:
                out.append(t)
    doc.close()
    return out


def is_hangul_dong(s: str) -> bool:
    return bool(re.match(r"^[\d가-힣]+동$", s))


def line_has_address(s: str) -> bool:
    return "서울" in s or "광진구" in s


def extract_address_from_merged(s: str) -> str:
    for marker in ("서울특별시", "서울시", "서울 "):
        idx = s.find(marker)
        if idx >= 0:
            return re.sub(r"\s+", " ", s[idx:].strip())
    idx = s.find("광진구")
    if idx >= 0:
        return re.sub(r"\s+", " ", ("서울특별시 " + s[idx:].strip()))
    return re.sub(r"\s+", " ", s.strip())


def normalize_road_address(addr: str) -> str:
    a = re.sub(r"\s+", " ", addr.strip())
    if not a:
        return a
    if a.startswith("서울"):
        return a
    if a.startswith("광진구"):
        return f"서울특별시 {a}"
    return f"서울특별시 광진구 {a}"


def parse_regular_pdf(path: Path) -> list[dict]:
    """종량제 PDF: 한 줄이 한 행. 4열=상호|대행+주소|동|전화, 5열=상호|대행|주소|동|전화, 3열=전화 생략."""
    rows: list[dict] = []
    for line in pdf_sorted_lines(path):
        if line in HEADER_LINES or line.startswith("★") or "참고사항" in line:
            continue
        if "기준 종량제" in line and "판매소" in line:
            continue
        if line in SKIP_NAMES or line.startswith("["):
            continue
        parts = [p.strip() for p in re.split(r"\s{2,}", line) if p.strip()]
        if len(parts) == 3:
            name, merged, dong = parts[0], parts[1], parts[2]
        elif len(parts) == 4:
            if parts[0] in HEADER_LINES or "행정동명" in line:
                continue
            # 4열: (상호|대행+주소|동|전화) 또는 (상호|대행|주소|동) — 대행만 있고 주소가 다음 칸인 경우
            if line_has_address(parts[1]):
                name, merged, dong = parts[0], parts[1], parts[2]
            else:
                name, merged, dong = parts[0], parts[2], parts[3]
        elif len(parts) == 5:
            name, merged, dong = parts[0], parts[2], parts[3]
        else:
            continue
        if not is_hangul_dong(dong):
            continue
        addr = normalize_road_address(extract_address_from_merged(merged))
        if not addr or not name:
            continue
        rows.append({"name": name, "roadAddress": addr, "_dong": dong})
    return rows


def parse_special_pdf(path: Path) -> list[dict]:
    """특수규격 PDF: '이름 … ○ … 행정동 주소' 한 줄."""
    rows: list[dict] = []
    for line in pdf_sorted_lines(path):
        if line in HEADER_LINES or line.startswith("★") or "참고사항" in line:
            continue
        if line.startswith("특수마대") and "판매" in line:
            continue
        if line in SKIP_NAMES:
            continue
        if "대행업체" in line and "판매소" in line:
            continue
        m = re.search(r"\s([가-힣0-9]+동)\s+(?=서울|광진구)", line)
        if not m:
            continue
        dong = m.group(1)
        if not is_hangul_dong(dong):
            continue
        addr_raw = line[m.end(1) :].strip()
        left = line[: m.start(1)].rstrip()
        name = re.sub(r"(\s+○)+\s*$", "", left).strip()
        if not name or name in SKIP_NAMES:
            continue
        if not line_has_address(addr_raw) and "광진구" not in addr_raw:
            continue
        addr = normalize_road_address(extract_address_from_merged(addr_raw))
        rows.append({"name": name, "roadAddress": addr, "_dong": dong})
    return rows


def merge_pdf_rows(
    regular: list[dict], special: list[dict]
) -> dict[str, dict]:
    by_k: dict[str, dict] = {}
    for s in regular:
        k = norm_key(s["name"], s["roadAddress"])
        by_k[k] = {
            "name": s["name"],
            "roadAddress": s["roadAddress"],
            "address": s["roadAddress"],
            "hasTrashBag": True,
            "hasSpecialBag": False,
        }
    for s in special:
        k = norm_key(s["name"], s["roadAddress"])
        if k in by_k:
            by_k[k]["hasSpecialBag"] = True
        else:
            by_k[k] = {
                "name": s["name"],
                "roadAddress": s["roadAddress"],
                "address": s["roadAddress"],
                "hasTrashBag": False,
                "hasSpecialBag": True,
            }
    return by_k


def strip_gwangjin_from_existing(existing: list[dict]) -> tuple[list[dict], int]:
    kept: list[dict] = []
    removed = 0
    for e in existing:
        ra = e.get("roadAddress") or ""
        ad = e.get("address") or ""
        if "광진구" in ra or "광진구" in ad:
            removed += 1
            continue
        kept.append(e)
    return kept, removed


def main():
    argv = sys.argv[1:]
    if len(argv) >= 2:
        reg_path = Path(argv[0]).expanduser().resolve()
        spec_path = Path(argv[1]).expanduser().resolve()
    else:
        reg_path = DEFAULT_REGULAR
        spec_path = DEFAULT_SPECIAL

    if not reg_path.exists():
        print(f"없음: {reg_path}")
        raise SystemExit(1)
    if not spec_path.exists():
        print(f"없음: {spec_path}")
        raise SystemExit(1)

    if not KAKAO_REST_KEY:
        print("KAKAO_REST_KEY 또는 KAKAO_REST_API_KEY 가 필요합니다.")
        raise SystemExit(1)

    regular = parse_regular_pdf(reg_path)
    special = parse_special_pdf(spec_path)
    print(f"종량제 PDF 파싱: {len(regular)}건")
    print(f"특수규격 PDF 파싱: {len(special)}건")

    merged = merge_pdf_rows(regular, special)
    print(f"병합 키 수: {len(merged)}")

    with open(OUT_JSON, "r", encoding="utf-8") as f:
        existing = json.load(f)

    existing, rm = strip_gwangjin_from_existing(existing)
    print(f"기존 광진구 레코드 제거: {rm}건")

    max_id = 0
    for e in existing:
        try:
            max_id = max(max_id, int(str(e.get("id", "0"))))
        except ValueError:
            pass

    cache = load_cache()
    geocode_failed: list[str] = []
    items = list(merged.values())
    for i, s in enumerate(items):
        coords = resolve_coords(
            s["roadAddress"], s["name"], cache, KAKAO_REST_KEY, None
        )
        if coords:
            s["lat"], s["lng"] = coords[0], coords[1]
        else:
            s["lat"] = s["lng"] = None
            geocode_failed.append(s["name"])
        if (i + 1) % 50 == 0:
            save_cache(cache)
            print(f"  지오코딩 … {i + 1}/{len(items)}")
    save_cache(cache)

    if geocode_failed:
        print(f"좌표 실패 {len(geocode_failed)}건 (일부): {geocode_failed[:20]}")

    exist_keys = {
        norm_key(e.get("name", ""), e.get("roadAddress") or e.get("address", ""))
        for e in existing
    }

    added = 0
    updated = 0
    for s in items:
        k0 = norm_key(s["name"], s["roadAddress"])
        if k0 in exist_keys:
            for e in existing:
                if norm_key(e.get("name", ""), e.get("roadAddress") or e.get("address", "")) != k0:
                    continue
                ch = False
                nt = bool(e.get("hasTrashBag")) or s["hasTrashBag"]
                ns = bool(e.get("hasSpecialBag")) or s["hasSpecialBag"]
                if nt != bool(e.get("hasTrashBag")) or ns != bool(e.get("hasSpecialBag")):
                    ch = True
                e["hasTrashBag"] = nt
                e["hasSpecialBag"] = ns
                od = e.get("dataReferenceDate") or ""
                if not od or REF_DATE > od:
                    e["dataReferenceDate"] = REF_DATE
                    ch = True
                if (e.get("lat") is None or e.get("lng") is None) and s.get("lat") is not None:
                    e["lat"], e["lng"] = s["lat"], s["lng"]
                    ch = True
                if ch:
                    updated += 1
                break
            continue

        if s.get("lat") is None:
            print(f"건너뜀(좌표 없음): {s['name']}")
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
            "hasTrashBag": s["hasTrashBag"],
            "hasSpecialBag": s["hasSpecialBag"],
            "hasLargeWasteSticker": False,
            "adminVerified": False,
            "dataReferenceDate": REF_DATE,
        }
        existing.append(rec)
        added += 1

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    print(f"갱신 {updated}건, 신규 {added}건 → 총 {len(existing)} 저장: {OUT_JSON}")


if __name__ == "__main__":
    main()
