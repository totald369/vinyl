#!/usr/bin/env python3
"""
전주시 종량제봉투 지정판매소 PDF(garbagein2025_01.pdf) → stores.sample.json
hasTrashBag=true, 카카오 주소/키워드 지오코딩.
"""

from __future__ import annotations

import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("pip install pymupdf 필요: pip install pymupdf")
    sys.exit(1)

PDF_PATH = Path.home() / "Downloads" / "garbagein2025_01.pdf"
OUT_PATH = Path(__file__).resolve().parent.parent / "public" / "data" / "stores.sample.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache.json"

KAKAO_REST_KEY = os.environ.get("KAKAO_REST_API_KEY") or "fd1c94f46de9b58135650e9fba4b5320"
GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"

DATA_REF = "2025-03-31"  # 2025년 1분기 기준
BATCH_SAVE = 150
REQUEST_DELAY = 0.05

JEONJU_GU = re.compile(r"(완산구|덕진구|전주시)")
STREET_LIKE = re.compile(
    r"(\d+번?길|[가-힣]+로\s*\d|동\s*\d+|[,，]\s*\d|\d+호\s*$|블럭|층\s*\d)",
    re.UNICODE,
)


def to_float(val):
    if val is None:
        return None
    try:
        f = float(val)
        return f if math.isfinite(f) else None
    except (ValueError, TypeError):
        return None


def _kakao_api(base_url, query):
    params = urllib.parse.urlencode({"query": query, "size": "1"})
    url = f"{base_url}?{params}"
    req = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {KAKAO_REST_KEY}"})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            docs = data.get("documents", [])
            if docs:
                lat = to_float(docs[0].get("y"))
                lng = to_float(docs[0].get("x"))
                if lat and lng:
                    return (lat, lng)
    except Exception:
        pass
    return None


def kakao_geocode(address: str, place_name: str | None = None):
    for q in address_variants(address):
        c = _kakao_api(GEOCODE_URL, q)
        if c:
            return c
    for q in address_variants(address):
        c = _kakao_api(KEYWORD_URL, q)
        if c:
            return c
    for jq in jibun_extra_queries(address):
        c = _kakao_api(GEOCODE_URL, jq)
        if c:
            return c
    if place_name:
        for q in (f"{place_name.strip()} 전주", f"{place_name.strip()} 전주시"):
            c = _kakao_api(KEYWORD_URL, q)
            if c:
                return c
    return None


def enrich_missing_gu(addr: str) -> str:
    """PDF에서 '완산구/덕진구'가 빠진 도로명 행 보강."""
    a = addr.strip()
    if JEONJU_GU.search(a):
        return a
    if not STREET_LIKE.search(a):
        return a
    if any(k in a for k in ("송천", "인후", "평화", "우아", "아하마을", "혁신", "중동", "진북", "팔복", "여의", "효자")):
        return "덕진구 " + a
    return "완산구 " + a


def fix_jeonju_road_typos(addr: str) -> str:
    """카카오 DB에 맞춘 흔한 PDF 오기·붙임 수정."""
    a = addr.strip()
    a = re.sub(r"(완산구|덕진구)\s+객사", r"\1 전주객사", a)
    a = re.sub(r"\)(\d)층", r") \1 층", a)
    a = re.sub(r"(\d+)\.(\d+)\s*층", r"\1 \2층", a)
    a = re.sub(r"([가-힣]+로)(\d)", r"\1 \2", a)
    a = re.sub(r"(\d+길)(\d)", r"\1 \2", a)
    return a


def jibun_extra_queries(addr: str) -> list[str]:
    """괄호 안 지번으로 보조 검색."""
    out: list[str] = []
    for m in re.finditer(r"\(([가-힣]+동\d*가?)\s*(\d+[\-\d]*)\)", addr.replace("（", "(").replace("）", ")")):
        dong, num = m.group(1), m.group(2)
        out.append(f"전북특별자치도 전주시 완산구 {dong} {num}")
        out.append(f"전북특별자치도 전주시 덕진구 {dong} {num}")
    for m in re.finditer(r"\(([가-힣]+동)\s+(\d+[\-\d]*)\)", addr):
        out.append(f"전북특별자치도 전주시 완산구 {m.group(1)} {m.group(2)}")
        out.append(f"전북특별자치도 전주시 덕진구 {m.group(1)} {m.group(2)}")
    seen: set[str] = set()
    uniq = []
    for q in out:
        if q not in seen:
            seen.add(q)
            uniq.append(q)
    return uniq


def normalize_full(addr: str) -> str:
    a = fix_jeonju_road_typos(enrich_missing_gu(addr.strip()))
    if a.startswith(("완산구", "덕진구")):
        return "전북특별자치도 전주시 " + a
    if a.startswith("전주시"):
        return "전북특별자치도 " + a
    if JEONJU_GU.search(a):
        return a if a.startswith("전북") else "전북특별자치도 " + a
    return "전북특별자치도 전주시 " + a


def address_variants(raw: str):
    full = normalize_full(raw)
    seen = {full}
    out = [full]
    if "전북특별자치도" in full:
        short = full.replace("전북특별자치도 ", "", 1)
        if short not in seen:
            seen.add(short)
            out.append(short)
    return out


def parse_pdf(path: Path) -> list[tuple[str, str]]:
    doc = fitz.open(path)
    lines: list[str] = []
    for i in range(doc.page_count):
        for ln in doc[i].get_text().splitlines():
            t = ln.strip()
            if t:
                lines.append(t)
    doc.close()

    filtered: list[str] = []
    for ln in lines:
        if ln.startswith("종량제봉투"):
            continue
        if ln == "판매소명":
            continue
        if re.match(r"^주\s*소$", ln):
            continue
        filtered.append(ln)

    pairs: list[tuple[str, str]] = []
    i = 0
    while i + 1 < len(filtered):
        name = filtered[i]
        addr = filtered[i + 1]
        if JEONJU_GU.search(addr) or STREET_LIKE.search(addr):
            pairs.append((name, enrich_missing_gu(addr)))
            i += 2
            continue
        i += 1

    # 중복 제거 (이름+주소)
    seen_k: set[tuple[str, str]] = set()
    uniq: list[tuple[str, str]] = []
    for n, a in pairs:
        k = (re.sub(r"\s+", "", n.lower()), re.sub(r"\s+", "", a))
        if k in seen_k:
            continue
        seen_k.add(k)
        uniq.append((n, a))
    return uniq


def load_cache():
    if CACHE_PATH.exists():
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache):
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False)


def coords_from_cache(cache, key):
    v = cache.get(key)
    if not v or not isinstance(v, (list, tuple)) or len(v) != 2:
        return None
    la, ln = to_float(v[0]), to_float(v[1])
    if la is None or ln is None:
        return None
    return (la, ln)


def put_coords_cache(cache, key, coords):
    if coords:
        cache[key] = [coords[0], coords[1]]


def find_jeonju_match(existing, name: str):
    n = name.strip()
    for s in existing:
        if s["name"].strip() != n:
            continue
        loc = (s.get("roadAddress") or "") + (s.get("address") or "")
        if "전주" in loc or "완산" in loc or "덕진" in loc:
            return s
    return None


def main():
    if not PDF_PATH.exists():
        print(f"PDF 없음: {PDF_PATH}")
        sys.exit(1)

    print("PDF 파싱…")
    pairs = parse_pdf(PDF_PATH)
    print(f"  → {len(pairs)} 매장 (중복 제거 후)")

    with open(OUT_PATH, "r", encoding="utf-8") as f:
        existing = json.load(f)
    max_id = max(int(s["id"]) for s in existing)
    cache = load_cache()

    updated = 0
    geocoded = 0
    failed = 0
    api_calls = 0
    new_stores: list[dict] = []

    for idx, (name, raw_addr) in enumerate(pairs):
        if not name or not raw_addr:
            continue

        match = find_jeonju_match(existing, name)
        if match:
            match["hasTrashBag"] = True
            match["dataReferenceDate"] = DATA_REF
            updated += 1
            continue

        full_for_geo = normalize_full(raw_addr)
        cache_key = "jj:" + full_for_geo
        coords = coords_from_cache(cache, cache_key)
        if coords is None:
            coords = kakao_geocode(full_for_geo, place_name=name)
            put_coords_cache(cache, cache_key, coords)
            api_calls += 1
            time.sleep(REQUEST_DELAY)

        if not coords:
            failed += 1
            print(f"  실패: {name} | {raw_addr}")
            continue

        geocoded += 1
        max_id += 1
        new_stores.append(
            {
                "id": str(max_id),
                "name": name,
                "lat": coords[0],
                "lng": coords[1],
                "roadAddress": full_for_geo,
                "address": raw_addr,
                "businessStatus": "영업",
                "hasTrashBag": True,
                "hasSpecialBag": False,
                "hasLargeWasteSticker": False,
                "adminVerified": False,
                "dataReferenceDate": DATA_REF,
            }
        )

        if len(new_stores) % BATCH_SAVE == 0:
            save_cache(cache)
            merged = existing + new_stores
            with open(OUT_PATH, "w", encoding="utf-8") as f:
                json.dump(merged, f, ensure_ascii=False, indent=2)
            print(f"  … 중간 저장 {len(new_stores)} 신규, API {api_calls}")

        if (idx + 1) % 200 == 0:
            print(f"  진행 {idx + 1}/{len(pairs)} (신규 {geocoded}, 갱신 {updated}, 실패 {failed})")

    save_cache(cache)
    merged = existing + new_stores
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)

    print("\n전주 PDF 병합 완료:")
    print(f"  기존 매장 hasTrashBag 갱신: {updated}")
    print(f"  신규 지오코딩: {geocoded}")
    print(f"  실패: {failed}")
    print(f"  최종 매장 수: {len(merged)}")
    print(f"Written: {OUT_PATH}")


if __name__ == "__main__":
    main()
