#!/usr/bin/env python3
"""
경기도 쓰레기 종량제봉투 판매업체현황 JSON(공공데이터) → stores.sample.json 병합.

입력 필드 예: BIZPLC_NM, REFINE_ROADNM_ADDR, REFINE_LOTNO_ADDR, REFINE_WGS84_LAT/LOGT,
BSN_STATE_NM, LICENSG_DE, APLCATN_DE, SIGUN_NM

- hasTrashBag: 영업·운영중인 지정 판매업만 True (종량제봉투 취급)
- hasSpecialBag / hasLargeWasteSticker: 이 데이터셋에 품목 구분 없음 → False
- businessStatus: 영업·운영중 → 영업, 그 외 문구는 그대로 정규화

이름+도로명주소 기준 중복 행은 활성 우선·최근 인허가일 기준 1행으로 합칩니다.

사용:
  python3 scripts/import_gyeonggi_trashbag_license.py \\
    --input ~/Downloads/쓰레기종량제봉투판매업체현황.json --dry-run
  python3 scripts/import_gyeonggi_trashbag_license.py --input ~/Downloads/....json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent
DEFAULT_MERGE = FRONTEND / "public" / "data" / "stores.sample.json"
DEFAULT_OUT = FRONTEND / "public" / "data" / "gyeonggi-trashbag-license-import.json"


def norm_store_name(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").strip().lower())
    return f"{norm_store_name(name).lower()}|{a}"


def parse_license_date(row: dict) -> int:
    for k in ("LICENSG_DE", "APLCATN_DE"):
        s = (row.get(k) or "").strip().replace("-", "")[:8]
        if s.isdigit():
            return int(s)
    return 0


def map_business_status(bsn_nm: str) -> str:
    s = (bsn_nm or "").strip()
    if s in ("영업", "운영중"):
        return "영업"
    if "폐업" in s or s in ("폐쇄",):
        return "폐업"
    if "휴업" in s:
        return "휴업"
    if s in ("제외사항",):
        return "제외"
    if not s:
        return ""
    return s


def is_active_license(bsn_nm: str) -> bool:
    return (bsn_nm or "").strip() in ("영업", "운영중")


def normalize_road(row: dict) -> str:
    road = (row.get("REFINE_ROADNM_ADDR") or "").strip()
    if road:
        return re.sub(r"\s+", " ", road)
    return re.sub(r"\s+", " ", (row.get("LOCPLC_ADDR") or "").strip())


def normalize_lot(row: dict) -> str:
    lot = (row.get("REFINE_LOTNO_ADDR") or "").strip()
    if lot:
        return re.sub(r"\s+", " ", lot)
    return normalize_road(row)


def row_to_store(row: dict) -> dict | None:
    name = (row.get("BIZPLC_NM") or "").strip()
    road = normalize_road(row)
    if not name or not road:
        return None
    if not road.startswith("경기"):
        # 비경기 주소는 제외
        return None
    try:
        lat_s = (row.get("REFINE_WGS84_LAT") or "").strip()
        lng_s = (row.get("REFINE_WGS84_LOGT") or "").strip()
        if not lat_s or not lng_s:
            return None
        lat = float(lat_s)
        lng = float(lng_s)
    except (TypeError, ValueError):
        return None
    if not (-90 < lat < 90) or not (-180 < lng < 180):
        return None

    bsn = (row.get("BSN_STATE_NM") or "").strip()
    status = map_business_status(bsn)
    active = is_active_license(bsn)
    ref = None
    for k in ("LICENSG_DE", "APLCATN_DE"):
        raw = (row.get(k) or "").strip()
        if len(raw) >= 8 and raw[:8].replace("-", "").isdigit():
            d = raw.replace("-", "")[:8]
            ref = f"{d[:4]}-{d[4:6]}-{d[6:8]}"
            break

    return {
        "name": name,
        "roadAddress": road,
        "address": normalize_lot(row) or road,
        "lat": lat,
        "lng": lng,
        "businessStatus": status or "영업",
        "hasTrashBag": active,
        "hasSpecialBag": False,
        "hasLargeWasteSticker": False,
        "dataReferenceDate": ref,
    }


def pick_best(rows: list[dict]) -> dict:
    """동일 키 행 중: 영업·운영중 우선, 그다음 인허가일 최신."""
    active = [r for r in rows if is_active_license(r.get("BSN_STATE_NM"))]
    pool = active if active else rows
    return max(pool, key=parse_license_date)


def in_gyeonggi_bbox(lat: float, lng: float) -> bool:
    return 36.95 <= lat <= 38.35 and 126.25 <= lng <= 127.65


def merge_into_existing(incoming: list[dict], merge_path: Path) -> tuple[int, int]:
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
        if not in_gyeonggi_bbox(la, ln):
            continue
        k0 = norm_key(s["name"], s["roadAddress"])
        if k0 in exist_keys:
            for e in existing:
                if norm_key(e.get("name", ""), e.get("roadAddress") or e.get("address", "")) != k0:
                    continue
                ch = False
                if s.get("hasTrashBag") and not e.get("hasTrashBag"):
                    e["hasTrashBag"] = True
                    ch = True
                if s.get("hasSpecialBag") and not e.get("hasSpecialBag"):
                    e["hasSpecialBag"] = True
                    ch = True
                if s.get("hasLargeWasteSticker") and not e.get("hasLargeWasteSticker"):
                    e["hasLargeWasteSticker"] = True
                    ch = True
                if s.get("businessStatus") and e.get("businessStatus") != s["businessStatus"]:
                    e["businessStatus"] = s["businessStatus"]
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
            "businessStatus": s.get("businessStatus") or "영업",
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
    ap = argparse.ArgumentParser(description="경기도 종량제봉투 판매업 라이선스 JSON → StoreData 병합")
    ap.add_argument(
        "--input",
        type=Path,
        default=Path.home() / "Downloads" / "쓰레기종량제봉투판매업체현황.json",
        help="공공데이터 JSON 경로",
    )
    ap.add_argument("--merge-into", type=Path, default=DEFAULT_MERGE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    inp = args.input.expanduser().resolve()
    if not inp.exists():
        print(f"파일 없음: {inp}", file=sys.stderr)
        raise SystemExit(1)

    print(f"로드: {inp}", file=sys.stderr)
    with open(inp, "r", encoding="utf-8") as f:
        raw_list = json.load(f)
    if not isinstance(raw_list, list):
        print("JSON 최상위는 배열이어야 합니다.", file=sys.stderr)
        raise SystemExit(1)

    by_key: dict[str, list[dict]] = {}
    for row in raw_list:
        road = normalize_road(row)
        k = norm_key(row.get("BIZPLC_NM") or "", road)
        by_key.setdefault(k, []).append(row)

    built: list[dict] = []
    skipped = 0
    for rows in by_key.values():
        best = pick_best(rows)
        st = row_to_store(best)
        if not st:
            skipped += 1
            continue
        built.append(st)

    print(
        f"원본 {len(raw_list)}건 → 키 {len(by_key)}건 → 좌표·주소 유효 {len(built)}건 (스킵 {skipped})",
        file=sys.stderr,
    )
    act = sum(1 for x in built if x["hasTrashBag"])
    print(f"  영업·운영중(hasTrashBag) {act}건", file=sys.stderr)

    if args.dry_run:
        for x in built[:20]:
            fl = "종량제" if x["hasTrashBag"] else "비활성"
            print(f"  [{fl}] {x['name']} | {x['roadAddress'][:56]}…")
        if len(built) > 20:
            print(f"  … 외 {len(built) - 20}건", file=sys.stderr)
        return

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(
            [
                {
                    **x,
                    "businessStatus": x.get("businessStatus") or "영업",
                    "adminVerified": False,
                }
                for x in built
            ],
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"저장: {args.out} ({len(built)}건)", file=sys.stderr)

    added, updated = merge_into_existing(built, args.merge_into.expanduser().resolve())
    print(f"병합: 신규 {added}건, 기존 갱신 {updated}건 → {args.merge_into}")


if __name__ == "__main__":
    main()
