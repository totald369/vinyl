#!/usr/bin/env python3
"""
강동구 구글맵 KML(종량제봉투 + 특수마대 폴더) → stores.sample.json 병합.
- Placemark에 좌표가 없으면 roadAddress 기준 카카오 지오코딩
- 동일 상호·주소는 hasTrashBag / hasSpecialBag 을 OR 로 합침

사용:
  export KAKAO_REST_KEY=... 또는 .env.local 의 KAKAO_REST_API_KEY
  python3 scripts/import_gangdong_kml.py
  python3 scripts/import_gangdong_kml.py /path/to/강동구....kml
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
import xml.etree.ElementTree as ET
from pathlib import Path

DOWNLOADS = Path.home() / "Downloads"
FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.sample.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-gangdong.json"

KML_NS = "{http://www.opengis.net/kml/2.2}"


def k(tag: str) -> str:
    return f"{KML_NS}{tag}"


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
    """특수마대 KML 상호 끝의 (사업자코드) 를 제거해 종량제 레코드와 동일 키로 병합."""
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    a = re.sub(r"\s+", " ", addr.strip().lower())
    return f"{norm_store_name(name).lower()}|{a}"


def extended_dict(pm: ET.Element) -> dict[str, str]:
    out: dict[str, str] = {}
    ext = pm.find(k("ExtendedData"))
    if ext is None:
        return out
    for data in ext.findall(k("Data")):
        nm = data.get("name") or ""
        val_el = data.find(k("value"))
        val = (val_el.text or "").strip() if val_el is not None else ""
        out[nm] = val
    return out


def text_child(pm: ET.Element, tag: str) -> str:
    el = pm.find(k(tag))
    return (el.text or "").strip() if el is not None else ""


def parse_kml_calendar_date(text: str) -> str | None:
    m = re.search(r"(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})", text)
    if m:
        y, mo, d = m.groups()
        return f"{y}-{int(mo):02d}-{int(d):02d}"
    return None


def parse_folder_title_date(title: str) -> str | None:
    m = re.search(r"\((\d{2})년\s*(\d{1,2})월\)", title)
    if m:
        yy, mo = m.groups()
        y = 2000 + int(yy)
        return f"{y}-{int(mo):02d}-01"
    return None


def folder_ref_date(folder: ET.Element) -> str | None:
    fn = folder.find(k("name"))
    t = parse_folder_title_date((fn.text or "").strip() if fn is not None else "") or None
    if t:
        return t
    for pm in folder.findall(k("Placemark")):
        dd = extended_dict(pm)
        for v in dd.values():
            if v and "기준" in v:
                d = parse_kml_calendar_date(v)
                if d:
                    return d
        desc = pm.find(k("description"))
        if desc is not None and desc.text:
            d = parse_kml_calendar_date(desc.text)
            if d:
                return d
    return None


def placemark_point(pm: ET.Element) -> tuple[float, float] | None:
    pt = pm.find(k("Point"))
    if pt is None:
        return None
    cel = pt.find(k("coordinates"))
    if cel is None or not (cel.text or "").strip():
        return None
    parts = cel.text.strip().split(",")
    if len(parts) < 2:
        return None
    lng, lat = to_float(parts[0]), to_float(parts[1])
    if lat is None or lng is None:
        return None
    return lat, lng


def full_gangdong_address(road: str) -> str:
    r = road.strip()
    if r.startswith("서울특별시"):
        return r
    return f"서울특별시 강동구 {r}"


def geocode_query_variants(full_addr: str) -> list[str]:
    """카카오가 거부하는 복잡한 호수·외 N필지 표기를 줄인 검색 후보."""
    seen: list[str] = []
    for q in (full_addr, re.sub(r"\s+", " ", full_addr).strip()):
        if q and q not in seen:
            seen.append(q)
    base = full_addr
    if "," in base:
        head = base.split(",")[0].strip()
        if head and head not in seen:
            seen.append(head)
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
    road_address: str, place_name: str, cache: dict, key: str
) -> tuple[float, float] | None:
    for qv in geocode_query_variants(road_address):
        c = kakao_geocode(qv, cache, key)
        if c:
            return c
    q2 = f"{road_address} {place_name}"
    c = kakao_geocode(q2, cache, key)
    if c:
        return c
    for qv in geocode_query_variants(road_address):
        c = kakao_keyword_geocode(qv, cache, key)
        if c:
            return c
    return kakao_keyword_geocode(f"강동구 {place_name}", cache, key)


def parse_kml(path: Path) -> list[dict]:
    tree = ET.parse(path)
    root = tree.getroot()
    doc = root.find(k("Document"))
    if doc is None:
        return []
    rows: list[dict] = []
    for folder in doc.findall(k("Folder")):
        fname_el = folder.find(k("name"))
        folder_name = (fname_el.text or "").strip() if fname_el is not None else ""
        is_trash = "종량제" in folder_name
        is_special = "특수" in folder_name
        if not is_trash and not is_special:
            continue
        ref_date = folder_ref_date(folder)
        for pm in folder.findall(k("Placemark")):
            pm_name = text_child(pm, "name")
            dd = extended_dict(pm)
            if is_trash:
                biz = (dd.get("unnamed (2)") or "").strip()
                road = (dd.get("unnamed (4)") or "").strip()
                if pm_name == "연번" or biz == "사업장명":
                    continue
                if not biz or not road:
                    continue
                if "기준" in road and re.search(r"\d{4}", road):
                    continue
                name = biz
                road_address = full_gangdong_address(road)
                has_trash, has_spec = True, False
            else:
                name = pm_name
                if not name:
                    continue
                road = (dd.get("unnamed (2)") or "").strip()
                addr_full = text_child(pm, "address")
                if not road and addr_full:
                    rest = addr_full.strip()
                    if rest.startswith(name):
                        rest = rest[len(name) :].strip()
                    road = rest
                if not road:
                    continue
                road_address = full_gangdong_address(road)
                has_trash, has_spec = False, True

            lat_lng = placemark_point(pm)
            rows.append(
                {
                    "name": name,
                    "roadAddress": road_address,
                    "address": road_address,
                    "businessStatus": "영업",
                    "hasTrashBag": has_trash,
                    "hasSpecialBag": has_spec,
                    "hasLargeWasteSticker": False,
                    "adminVerified": False,
                    "dataReferenceDate": ref_date,
                    "_source_file": path.name,
                    "_point": lat_lng,
                }
            )
    return rows


def discover_kml_paths(argv: list[str]) -> list[Path]:
    if argv:
        return [Path(a).expanduser().resolve() for a in argv]
    paths: list[Path] = []
    for p in DOWNLOADS.glob("*.kml"):
        if "강동구" not in p.name:
            continue
        paths.append(p.resolve())
    uniq: dict[str, Path] = {}
    for p in paths:
        uniq[str(p)] = p
    return sorted(uniq.values(), key=lambda x: x.name)


def main():
    if not KAKAO_REST_KEY:
        print("KAKAO_REST_KEY 또는 KAKAO_REST_API_KEY 가 필요합니다.")
        raise SystemExit(1)

    kml_paths = discover_kml_paths(sys.argv[1:])
    if not kml_paths:
        print(f"KML 없음: 인자로 경로를 주거나 {DOWNLOADS} 에 강동구*.kml 을 두세요.")
        raise SystemExit(1)

    raw: list[dict] = []
    for p in kml_paths:
        if not p.exists():
            print(f"건너뜀 (없음): {p}")
            continue
        part = parse_kml(p)
        print(f"  {p.name}: {len(part)}건")
        raw.extend(part)

    by_key: dict[str, dict] = {}
    for s in raw:
        k0 = norm_key(s["name"], s["roadAddress"])
        if k0 not in by_key:
            by_key[k0] = s
        else:
            prev = by_key[k0]
            prev["hasTrashBag"] = prev["hasTrashBag"] or s["hasTrashBag"]
            prev["hasSpecialBag"] = prev["hasSpecialBag"] or s["hasSpecialBag"]
            rd = prev.get("dataReferenceDate")
            sd = s.get("dataReferenceDate")
            if sd and (not rd or sd > rd):
                prev["dataReferenceDate"] = sd
            pt = s.get("_point")
            if pt and not prev.get("_point"):
                prev["_point"] = pt
            if "(" in prev.get("name", "") and "(" not in s.get("name", ""):
                prev["name"] = s["name"]

    unique = list(by_key.values())
    print(f"중복 제거 후 {len(unique)}건")

    cache = load_cache()
    geocode_failed: list[str] = []
    print("지오코딩 중…")
    for i, s in enumerate(unique):
        coords = s.pop("_point", None)
        if coords:
            s["lat"], s["lng"] = coords[0], coords[1]
        else:
            coords = resolve_coords(
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
        print(f"좌표 실패 {len(geocode_failed)}건 (일부): {geocode_failed[:20]}")

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
                if (bool(e.get("hasTrashBag")) or s["hasTrashBag"]) != bool(e.get("hasTrashBag")):
                    ch = True
                e["hasTrashBag"] = bool(e.get("hasTrashBag")) or s["hasTrashBag"]
                if (bool(e.get("hasSpecialBag")) or s["hasSpecialBag"]) != bool(
                    e.get("hasSpecialBag")
                ):
                    ch = True
                e["hasSpecialBag"] = bool(e.get("hasSpecialBag")) or s["hasSpecialBag"]
                if s.get("dataReferenceDate"):
                    od = e.get("dataReferenceDate") or ""
                    if s["dataReferenceDate"] and (not od or (s["dataReferenceDate"] > od)):
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

    print(
        f"갱신 {updated}건, 신규 {added}건 → 총 {len(existing)} 저장: {OUT_JSON}"
    )


if __name__ == "__main__":
    main()
