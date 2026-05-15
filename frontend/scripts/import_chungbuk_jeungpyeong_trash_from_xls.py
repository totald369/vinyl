#!/usr/bin/env python3
"""
충청북도 증평군 관급(종량제) 봉투 판매업소.xls → stores.chungbuk-jeungpyeong-trash.json

시트: 상호 | 판매소위치(도로명) | 판매소위치(지번)

  pip install xlrd
  python3 scripts/import_chungbuk_jeungpyeong_trash_from_xls.py \\
    --input ~/Downloads/관급봉투판매업소현황\\(2025.08.\\).xls

KAKAO_REST_API_KEY: frontend/.env.local
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import xlrd

FRONTEND = Path(__file__).resolve().parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.chungbuk-jeungpyeong-trash.json"
CACHE_PATH = SCRIPT_DIR / "geocode-cache-chungbuk-jeungpyeong-trash.json"
DL = Path.home() / "Downloads"
DEFAULT_INPUT = DL / "관급봉투판매업소현황(2025.08.).xls"

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
GEOCODE_DELAY = 0.07

WS_RE = re.compile(r"[ \t\r\n\v\f]+")
_REF_FILENAME = re.compile(r"\(?\s*(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*\)?")


def _load_dotenv_local() -> None:
    p = FRONTEND / ".env.local"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


_load_dotenv_local()


def load_kakao_key() -> str | None:
    return (
        os.environ.get("KAKAO_REST_API_KEY", "").strip()
        or os.environ.get("KAKAO_REST_KEY", "").strip()
    )


def collapse(s: str) -> str:
    return WS_RE.sub(" ", (str(s) or "").replace("\xa0", " ")).strip()


def cell_str(sh: xlrd.sheet.Sheet, r: int, c: int) -> str:
    v = sh.cell_value(r, c)
    if v is None or v == "":
        return ""
    if isinstance(v, float):
        if v == int(v):
            return str(int(v))
        return str(v)
    return str(v).strip()


def ref_date_from_path(p: Path) -> str:
    m = _REF_FILENAME.search(p.name)
    if m:
        y, mo = m.groups()
        return f"{int(y):04d}-{int(mo):02d}-01"
    return "2025-08-01"


def normalize_prefix(addr: str) -> str:
    a = collapse(addr)
    if a.startswith("충북 ") or a.startswith("충북\t"):
        a = "충청북도 " + a[2:].lstrip()
    elif a.startswith("충북"):
        rest = a[2:].lstrip()
        if not rest.startswith("충청북도"):
            a = ("충청북도 " + rest).strip()
    return collapse(a)


def is_jeungpyeong_addr(blob: str) -> bool:
    b = blob.replace(" ", "")
    return "증평군" in b and ("충청북도" in b or "충북" in b)


def in_jeungpyeong_bbox(lat: float, lng: float) -> bool:
    return 36.65 <= lat <= 36.92 and 127.35 <= lng <= 127.72


def parse_float(v: object) -> float | None:
    try:
        f = float(str(v).strip())
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def load_cache() -> dict[str, list[float]]:
    if not CACHE_PATH.is_file():
        return {}
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_cache(c: dict[str, list[float]]) -> None:
    CACHE_PATH.write_text(json.dumps(c, ensure_ascii=False, indent=2), encoding="utf-8")


def _doc_addr_blob(d: dict) -> str:
    parts: list[str] = []

    def touch(v: object) -> None:
        if isinstance(v, str) and v.strip():
            parts.append(v.strip())
        elif isinstance(v, dict):
            for sk in ("address_name", "region_1depth_name", "region_2depth_name"):
                s = v.get(sk)
                if isinstance(s, str) and s.strip():
                    parts.append(s.strip())

    touch(d.get("address_name"))
    touch(d.get("address"))
    touch(d.get("road_address"))
    return " ".join(parts)


def region_ok(blob: str) -> bool:
    z = collapse(blob)
    if "증평군" not in z.replace(" ", ""):
        return False
    return "충청북도" in z or "충북" in z


def kakao_address(
    query: str, key: str, *, relaxed_region: bool = False
) -> tuple[float | None, float | None]:
    q = collapse(query)
    if not q:
        return None, None
    req = urllib.request.Request(
        f"{GEOCODE_URL}?{urllib.parse.urlencode({'query': q})}",
        headers={"Authorization": f"KakaoAK {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None, None
    for d in data.get("documents") or []:
        lat = parse_float(d.get("y"))
        lng = parse_float(d.get("x"))
        if lat is None or lng is None:
            continue
        if not in_jeungpyeong_bbox(lat, lng):
            continue
        blob = _doc_addr_blob(d)
        if relaxed_region:
            zb = blob.replace(" ", "")
            if "증평" not in zb:
                continue
        elif not region_ok(blob):
            continue
        return lat, lng
    return None, None


def kakao_keyword(
    query: str, key: str, *, relaxed_region: bool = False
) -> tuple[float | None, float | None]:
    q = collapse(query)
    if not q:
        return None, None
    req = urllib.request.Request(
        f"{KEYWORD_URL}?{urllib.parse.urlencode({'query': q, 'size': '15'})}",
        headers={"Authorization": f"KakaoAK {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None, None
    for d in data.get("documents") or []:
        lat = parse_float(d.get("y"))
        lng = parse_float(d.get("x"))
        if lat is None or lng is None:
            continue
        if not in_jeungpyeong_bbox(lat, lng):
            continue
        blob = f"{d.get('road_address_name') or ''} {d.get('address_name') or ''}"
        if relaxed_region:
            if "증평" not in blob.replace(" ", ""):
                continue
        elif not region_ok(blob):
            continue
        return lat, lng
    return None, None


def _lot_bunji_ho_as_dash(lot: str) -> str | None:
    """「○○리 N번지 M호」(구지번) → 카카오가 받는 신지번 「○○리 N-M」."""
    lot = normalize_prefix(lot)
    m = re.search(r"([가-힣]+리)\s+(\d+)\s*번지\s*(\d+)\s*호", lot)
    if not m:
        return None
    s = lot[: m.start()] + f"{m.group(1)} {m.group(2)}-{m.group(3)}" + lot[m.end() :]
    return collapse(s)


def _lot_shorter_variants(lot: str) -> list[str]:
    """지번 행에 붙은 상가·호·외 필지 접미사를 줄여 주소 검색 성공률을 올린다."""
    lot = normalize_prefix(lot)
    if not lot:
        return []
    v: list[str] = []

    def add(s: str) -> None:
        t = collapse(s)
        if t and t not in v:
            v.append(t)

    add(lot)
    dash = _lot_bunji_ho_as_dash(lot)
    if dash:
        add(dash)
    if " 외 " in lot:
        add(re.sub(r"\s+외\s+.*$", "", lot).strip())
    if "번지" in lot:
        i = lot.find("번지")
        add(lot[: i + len("번지")].strip())
        add(lot[:i].strip())
        add(re.sub(r"\s*번지\s*", " ", lot).strip())
    no_store = re.sub(r"\s*상가.*$", "", lot, flags=re.IGNORECASE).strip()
    add(no_store)
    add(re.sub(r"\s+\d+호\s*$", "", no_store).strip())
    return v


def geocode_candidates(road: str, lot: str, name: str) -> list[str]:
    road = normalize_prefix(road)
    lot = normalize_prefix(lot)
    out: list[str] = []
    seen: set[str] = set()

    def push(s: str) -> None:
        t = collapse(s)
        if t and t not in seen:
            seen.add(t)
            out.append(t)

    push(road)
    for piece in _lot_shorter_variants(lot):
        push(piece)
    if road:
        push(re.sub(r"\s*\([^)]*\)\s*", " ", road))
    push(f"{name} 증평")
    push(f"{name} 증평군")
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    ap.add_argument("--skip-kakao", action="store_true")
    args = ap.parse_args()
    inp = args.input.expanduser()
    if not inp.is_file():
        raise SystemExit(f"파일 없음: {inp}")

    key = load_kakao_key()
    allow_kakao = not args.skip_kakao and bool(key)
    if not allow_kakao:
        raise SystemExit("KAKAO_REST_API_KEY 필요 (frontend/.env.local) 또는 테스트용 불가 시 생략 불가")

    wb = xlrd.open_workbook(inp)
    sheet = wb.sheet_by_index(0)
    if sheet.nrows < 2:
        raise SystemExit("행 없음")

    h0 = cell_str(sheet, 0, 0)
    if "상호" not in h0:
        raise SystemExit("헤더(상호) 없음")

    i_name, i_road, i_lot = 0, 1, 2
    ref_date = ref_date_from_path(inp)
    cache = load_cache()
    out: list[dict] = []
    geo_n = 0
    misses = 0
    seen_key: set[str] = set()

    for r in range(1, sheet.nrows):
        name = cell_str(sheet, r, i_name)
        road = cell_str(sheet, r, i_road)
        lot = cell_str(sheet, r, i_lot)
        if not name:
            continue
        if not road and not lot:
            continue
        blob_chk = normalize_prefix((road + " " + lot).strip())
        if not is_jeungpyeong_addr(blob_chk):
            continue

        dk = hashlib.sha1(f"{name}\x1f{road}\x1f{lot}".encode()).hexdigest()[:24]
        if dk in seen_key:
            continue
        seen_key.add(dk)

        road_n = normalize_prefix(road)
        lot_n = normalize_prefix(lot)
        ck = "jp:" + hashlib.sha1(f"{name}:{road_n}:{lot_n}".encode()).hexdigest()[:32]
        lat = lng = None
        if ck in cache and len(cache[ck]) == 2:
            lat, lng = float(cache[ck][0]), float(cache[ck][1])
        elif allow_kakao:
            for relaxed in (False, True):
                for q in geocode_candidates(road, lot, name):
                    la, ln = kakao_address(q, key, relaxed_region=relaxed)
                    if la is None:
                        la, ln = kakao_keyword(q, key, relaxed_region=relaxed)
                    if la is not None:
                        lat, lng = la, ln
                        break
                if lat is not None:
                    break
            if lat is None:
                misses += 1
                print(f"[geocode 실패] {name}\t{road_n}", file=sys.stderr)
                continue
            cache[ck] = [float(lat), float(lng)]
            geo_n += 1
            if geo_n % 40 == 0:
                save_cache(cache)
                print(f"[geocode] {geo_n} …", file=sys.stderr)
            time.sleep(GEOCODE_DELAY)
        else:
            continue

        rid = (
            "chungbuk-jeungpyeong-trash-"
            + hashlib.sha1(f"{name}\n{road_n}\n{lot_n}".encode()).hexdigest()[:20]
        )
        display_road = road_n or lot_n
        rec: dict = {
            "id": rid,
            "name": name,
            "lat": round(float(lat), 7),
            "lng": round(float(lng), 7),
            "roadAddress": display_road,
            "address": lot_n or display_road,
            "businessStatus": "영업",
            "hasTrashBag": True,
            "hasSpecialBag": False,
            "hasLargeWasteSticker": False,
            "adminVerified": True,
            "dataReferenceDate": ref_date,
        }
        out.append(rec)

    save_cache(cache)
    out.sort(key=lambda x: (x["name"], x["roadAddress"]))
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(out)} → {OUT_JSON} (ref_date={ref_date}, api≈{geo_n}, miss={misses})")


if __name__ == "__main__":
    main()
