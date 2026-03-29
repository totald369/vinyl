#!/usr/bin/env python3
"""
용산구(또는 유사 포맷) 종량제봉투 판매소 CSV → trashbagmap StoreData 형식.

데이터 받는 법:
  1) 공공데이터포털
     https://www.data.go.kr/data/15113139/fileData.do
     「서울특별시 용산구_쓰레기 종량제봉투 판매소 현황」CSV (보통 CP949)
  2) 공식 4컬럼(번호·대행업체명·회사명·주소)이면 자동으로 hasTrashBag만 true, hasSpecialBag는 false.
  3) 일반/특수 구분 컬럼이 있는 다른 CSV는 --allow-special-columns 로 특수 열 해석 허용.

좌표가 없으면 .env.local 의 KAKAO_REST_API_KEY 로 주소 지오코딩(노원 스크립트와 동일 계열).

사용 예:
  python3 scripts/import_yongsan_trashbag_csv.py ~/Downloads/용산구*.csv
  python3 scripts/import_yongsan_trashbag_csv.py ./data.csv --out public/data/yongsan-special.json
  python3 scripts/import_yongsan_trashbag_csv.py ./data.csv --merge-into public/data/stores.sample.json
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
from datetime import datetime, timezone
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent
DEFAULT_OUT = FRONTEND / "public" / "data" / "yongsan-trashbag-import.json"
DEFAULT_MERGE = FRONTEND / "public" / "data" / "stores.sample.json"
CACHE_PATH = Path(__file__).resolve().parent / "geocode-cache-yongsan.json"


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
GEOCODE_DELAY = 0.06
DISTRICT_PREFIX = "서울특별시 용산구"


def to_float(val):
    if val is None or val == "":
        return None
    try:
        f = float(str(val).replace(",", "").strip())
        return f if math.isfinite(f) else None
    except (ValueError, TypeError):
        return None


def _str(v) -> str:
    if v is None:
        return ""
    return str(v).strip()


def is_affirmative(val: str) -> bool:
    if not val:
        return False
    v = val.strip().lower()
    if v in ("y", "yes", "o", "1", "true", "예", "있음", "가능", "판매", "○", "●"):
        return True
    if re.match(r"^[yYoOxX✓✔]", val.strip()):
        return True
    if "판매" in val and "미" not in val[:4]:
        return True
    return False


def norm_store_name(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    a = re.sub(r"\s+", " ", addr.strip().lower())
    return f"{norm_store_name(name).lower()}|{a}"


def load_cache() -> dict:
    if CACHE_PATH.exists():
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(c: dict) -> None:
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(c, f, ensure_ascii=False)


def kakao_geocode(address: str, cache: dict) -> tuple[float, float] | None:
    if not KAKAO_KEY or not address:
        return None
    h = hashlib.sha256(address.encode("utf-8")).hexdigest()[:16]
    if h in cache:
        lat, lng = cache[h]
        return float(lat), float(lng)

    def req(url: str) -> tuple[float, float] | None:
        r = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {KAKAO_KEY}"})
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

    for q in (address,):
        qe = urllib.parse.urlencode({"query": q})
        coords = req(f"{GEOCODE_URL}?{qe}")
        if coords:
            cache[h] = list(coords)
            time.sleep(GEOCODE_DELAY)
            return coords
        qe2 = urllib.parse.urlencode({"query": q, "size": "1"})
        coords = req(f"{KEYWORD_URL}?{qe2}")
        if coords:
            cache[h] = list(coords)
            time.sleep(GEOCODE_DELAY)
            return coords
    time.sleep(GEOCODE_DELAY)
    return None


def normalize_header(h: str) -> str:
    return re.sub(r"\s+", " ", (h or "").strip())


def read_csv_text(path: Path) -> str:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "utf-8", "cp949", "euc-kr"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def is_yongsan_official_four_column(headers: list[str]) -> bool:
    """공공데이터 '용산구 종량제봉투 판매소 현황' 표준 형식(특수 구분 없음 → 종량제만)."""
    parts = {normalize_header(h).replace(" ", "") for h in headers if h}
    return "회사명" in parts and "주소" in parts and "번호" in parts


def pick_name(row: dict, norm_headers: dict[str, str]) -> str:
    for key in (
        "회사명",
        "판매소명",
        "업소명",
        "상호",
        "가맹점명",
        "사업장명",
        "bplc_nm",
        "store_nm",
    ):
        for hk, orig in norm_headers.items():
            if key in hk or hk in key:
                v = _str(row.get(orig))
                if v:
                    return v
    for orig in row.keys():
        if "명" in orig and "주소" not in orig:
            v = _str(row.get(orig))
            if v and len(v) < 80:
                return v
    return ""


def pick_address(row: dict, norm_headers: dict[str, str]) -> tuple[str, str]:
    road_keys = (
        "도로명",
        "소재지도로명",
        "road",
        "도로명주소",
    )
    lot_keys = ("지번", "lot", "소재지지번")
    road, lot = "", ""
    for hk, orig in norm_headers.items():
        if any(k in hk for k in road_keys) and "지번" not in hk:
            road = _str(row.get(orig)) or road
        if any(k in hk for k in lot_keys):
            lot = _str(row.get(orig)) or lot
    if not road:
        for hk, orig in norm_headers.items():
            if hk in ("주소", "소재지", "address") or "주소" == hk[-2:]:
                road = _str(row.get(orig))
                if road:
                    break
    primary = re.sub(r"\s+", " ", road or lot)
    if primary:
        if primary.startswith("서울특별시") or primary.startswith("서울시"):
            pass
        elif primary.startswith("용산구"):
            primary = "서울특별시 " + primary
        elif not primary.startswith("서울"):
            primary = f"{DISTRICT_PREFIX} {primary.lstrip()}"
    return primary, lot


def pick_lat_lng(row: dict, norm_headers: dict[str, str]) -> tuple[float | None, float | None]:
    lat = lng = None
    for hk, orig in norm_headers.items():
        if hk in ("위도", "lat", "y", "latitude") or "위도" in hk:
            lat = to_float(row.get(orig)) or lat
        if hk in ("경도", "lng", "lon", "x", "longitude") or "경도" in hk:
            lng = to_float(row.get(orig)) or lng
    return lat, lng


def header_classification(headers: list[str]) -> tuple[list[str], list[str]]:
    """(일반 쪽 컬럼 원본명 목록, 특수 쪽 컬럼 원본명 목록)"""
    general_cols: list[str] = []
    special_cols: list[str] = []
    for h in headers:
        n = normalize_header(h)
        nk = n.replace(" ", "")
        if not n:
            continue
        if any(
            t in nk
            for t in (
                "특수",
                "마대",
                "불연",
                "규격종량",
                "특수규격",
                "PP",
                "건설",
            )
        ):
            if "미" in nk[:3]:
                continue
            special_cols.append(h)
        elif any(
            t in nk
            for t in (
                "일반",
                "생활종량",
                "종량제봉투",
                "음식물",
            )
        ) and "특수" not in nk:
            if "가격" in nk or "원" in nk:
                continue
            general_cols.append(h)
    return general_cols, special_cols


def row_flags_from_columns(
    row: dict, general_cols: list[str], special_cols: list[str]
) -> tuple[bool, bool]:
    g = any(is_affirmative(_str(row.get(c))) for c in general_cols)
    s = any(is_affirmative(_str(row.get(c))) for c in special_cols)
    if special_cols and not any(_str(row.get(c)) for c in special_cols):
        s = False
    if general_cols and not any(_str(row.get(c)) for c in general_cols):
        g = False
    return g, s


def parse_csv(
    path: Path,
    *,
    special_only_column: str | None,
    rows_as_special_only: bool,
    filter_gu: str | None,
    allow_special_columns: bool,
) -> list[dict]:
    raw_text = read_csv_text(path)
    lines = raw_text.splitlines()
    if not lines:
        return []
    reader = csv.DictReader(lines)
    headers = reader.fieldnames or []
    norm_map = {normalize_header(h): h for h in headers}
    yongsan_official = is_yongsan_official_four_column(headers)
    general_cols, special_cols = header_classification(headers)
    if yongsan_official and not allow_special_columns:
        general_cols, special_cols = [], []
    if special_only_column:
        special_cols = [c for c in headers if normalize_header(c) == normalize_header(special_only_column)]
        if not special_cols:
            print(f"경고: --special-only-column '{special_only_column}' 에 해당하는 헤더가 없습니다.", file=sys.stderr)
    if rows_as_special_only:
        general_cols = []
        special_cols = list(headers)

    rows_out: list[dict] = []
    for row in reader:
        name = pick_name(row, norm_map)
        road, lot = pick_address(row, norm_map)
        if not name or not road:
            continue
        if filter_gu and filter_gu not in road:
            continue

        lat, lng = pick_lat_lng(row, norm_map)
        g_flag, s_flag = row_flags_from_columns(row, general_cols, special_cols)

        if yongsan_official and not allow_special_columns:
            g_flag, s_flag = True, False
        elif rows_as_special_only:
            g_flag, s_flag = False, True
        elif special_only_column and special_cols:
            s_flag = any(is_affirmative(_str(row.get(c))) for c in special_cols)
        elif special_cols or general_cols:
            pass
        else:
            g_flag, s_flag = True, False

        ref_date = None
        for h in headers:
            if "기준" in h or "갱신" in h or "일자" in h or "ymd" in h.lower():
                v = _str(row.get(h))
                m = re.search(r"(\d{4})[-./](\d{2})[-./](\d{2})", v)
                if m:
                    ref_date = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
                    break

        hid = hashlib.sha256(f"{name}|{road}".encode("utf-8")).hexdigest()[:16]
        rows_out.append(
            {
                "id": f"yongsan-{hid}",
                "name": name,
                "roadAddress": road,
                "address": lot or road,
                "lat": lat,
                "lng": lng,
                "hasTrashBag": bool(g_flag),
                "hasSpecialBag": bool(s_flag),
                "hasLargeWasteSticker": False,
                "businessStatus": "영업",
                "adminVerified": False,
                "dataReferenceDate": ref_date,
            }
        )
    return rows_out


def merge_into_existing(
    incoming: list[dict],
    merge_path: Path,
    *,
    only_special: bool,
) -> None:
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
        if only_special and not s.get("hasSpecialBag"):
            continue
        if s.get("lat") is None or s.get("lng") is None:
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
            "businessStatus": s.get("businessStatus", "영업"),
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
    ap = argparse.ArgumentParser(description="용산구 종량제 CSV → StoreData JSON")
    ap.add_argument("csv_path", type=Path, help="다운로드한 CSV 경로")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="단독 출력 JSON")
    ap.add_argument(
        "--merge-into",
        type=Path,
        default=None,
        help="stores.sample.json 등 기존 배열에 병합",
    )
    ap.add_argument(
        "--filter-gu",
        default="용산",
        help="도로명주소에 이 문자열이 있을 때만 포함 (기본: 용산). 전체 허용은 빈 문자열",
    )
    ap.add_argument(
        "--special-only-column",
        default=None,
        help="이 헤더만 보고 특수 판매 여부 판정 (Y/예/판매 등)",
    )
    ap.add_argument(
        "--rows-as-special-only",
        action="store_true",
        help="모든 행을 hasSpecialBag만 true (구분 컬럼 없을 때 임시용)",
    )
    ap.add_argument(
        "--emit-special-only",
        action="store_true",
        help="출력/병합 시 hasSpecialBag 인 행만",
    )
    ap.add_argument(
        "--allow-special-columns",
        action="store_true",
        help="CSV 헤더에서 특수봉투 열을 해석(hasSpecialBag). 용산 공식 4컬럼은 기본 비활성(종량제만).",
    )
    ap.add_argument("--skip-geocode", action="store_true", help="좌표 없는 행은 버림")
    args = ap.parse_args()
    path = args.csv_path.expanduser().resolve()
    if not path.exists():
        print(f"파일 없음: {path}", file=sys.stderr)
        raise SystemExit(1)

    filt = (args.filter_gu or "").strip() or None
    rows = parse_csv(
        path,
        special_only_column=args.special_only_column,
        rows_as_special_only=args.rows_as_special_only,
        filter_gu=filt,
        allow_special_columns=args.allow_special_columns,
    )
    print(f"CSV에서 {len(rows)}건 파싱")

    need_geo = [r for r in rows if r.get("lat") is None or r.get("lng") is None]
    if need_geo and not args.skip_geocode:
        if not KAKAO_KEY:
            print("KAKAO_REST_API_KEY 가 없어 지오코딩 불가. --skip-geocode 또는 키 설정.", file=sys.stderr)
            raise SystemExit(1)
        cache = load_cache()
        print(f"지오코딩 {len(need_geo)}건…")
        for i, r in enumerate(rows):
            if r.get("lat") is not None and r.get("lng") is not None:
                continue
            c = kakao_geocode(r["roadAddress"], cache)
            if not c:
                c = kakao_geocode(f"{r['name']} {DISTRICT_PREFIX}", cache)
            if c:
                r["lat"], r["lng"] = c
            if (i + 1) % 40 == 0:
                save_cache(cache)
        save_cache(cache)
    elif need_geo and args.skip_geocode:
        rows = [r for r in rows if r.get("lat") is not None and r.get("lng") is not None]

    if args.emit_special_only:
        rows = [r for r in rows if r.get("hasSpecialBag")]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    print(f"저장: {args.out} ({len(rows)}건)")

    if args.merge_into:
        merge_into_existing(
            rows,
            args.merge_into.expanduser().resolve(),
            only_special=bool(args.emit_special_only),
        )


if __name__ == "__main__":
    main()
