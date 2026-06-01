#!/usr/bin/env python3
"""
전라남도 여수시 종량제봉투 판매업체 CSV → stores.jeonnam-yeosu-trash.json

(2026년 공개청구 xls는 import_jeonnam_yeosu_trash_from_xls.py 사용)

입력: 판매 업체 상호 명, 도로명/지번 주소, 위·경도, 종량제봉투·대형폐기물 스티커 판매 여부

  python3 scripts/import_jeonnam_yeosu_trash_from_csv.py \\
    --input ~/Downloads/전라남도\\ 여수시_종량제봉투판매업체_20230125.csv
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.jeonnam-yeosu-trash.json"
DL = Path.home() / "Downloads"
DEFAULT_INPUT = DL / "전라남도 여수시_종량제봉투판매업체_20230125.csv"
REF_DATE = "2023-01-25"

WS_RE = re.compile(r"[ \t\r\n\v\f]+")
_REF_FILENAME = re.compile(r"(\d{4})(\d{2})(\d{2})")


def collapse(s: str) -> str:
    return WS_RE.sub(" ", (s or "").replace("\xa0", " ")).strip()


def decode_csv(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp949", "euc-kr", "utf-8"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("cp949", errors="replace")


def parse_float(v: object) -> float | None:
    try:
        f = float(str(v).strip())
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def ref_date_from_path(p: Path) -> str:
    m = _REF_FILENAME.search(p.name)
    if m:
        y, mo, d = m.groups()
        return f"{y}-{mo}-{d}"
    return REF_DATE


def in_yeosu_bbox(lat: float, lng: float) -> bool:
    # 돌산·거문도(삼산면) 등 섬 포함
    return 34.0 <= lat <= 34.95 and 127.2 <= lng <= 127.95


def yeosu_in_text(blob: str) -> bool:
    return "여수" in (blob or "").replace(" ", "")


def format_jibeon(raw: str) -> str:
    a = collapse(raw)
    a = re.sub(r"^전남\s+", "전라남도 ", a)
    if not a:
        return ""
    if a.startswith("전라남도"):
        return a
    if a.startswith("여수시"):
        return f"전라남도 {a}"
    return f"전라남도 여수시 {a}"


def format_road(raw: str, jibeon: str) -> str:
    a = collapse(raw)
    if not a:
        return format_jibeon(jibeon)
    a = re.sub(r"^전남\s+", "전라남도 ", a)
    if a.startswith("전라남도"):
        return a
    if a.startswith("여수시"):
        return f"전라남도 {a}"
    return f"전라남도 여수시 {a}"


def yn_any(row: dict, cols: list[str]) -> bool:
    return any(str(row.get(c, "")).strip().upper() == "Y" for c in cols)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    args = ap.parse_args()
    inp: Path = args.input.expanduser()
    if not inp.exists():
        raise SystemExit(f"CSV 없음: {inp}")

    path_ref = ref_date_from_path(inp)
    text = decode_csv(inp.read_bytes())
    reader = csv.DictReader(text.splitlines())
    trash_cols = [k for k in (reader.fieldnames or []) if "종량제 봉투" in k and "판매여부" in k]
    sticker_cols = [k for k in (reader.fieldnames or []) if "스티커" in k and "판매" in k]
    if not trash_cols:
        raise SystemExit("종량제봉투 판매여부 컬럼을 찾을 수 없습니다")

    out: list[dict] = []
    seen: set[str] = set()
    skipped = 0

    for r in reader:
        name = collapse(r.get("판매 업체 상호 명") or "")
        road_raw = collapse(r.get("판매 업체 소재지도로명주소") or "")
        jib_raw = collapse(r.get("판매 업체 소재지지번주소") or "")
        ref_date = collapse(r.get("데이터기준일자") or "") or path_ref
        lat = parse_float(r.get("판매 업체 위도"))
        lng = parse_float(r.get("판매 업체 경도"))

        if not name or (not road_raw and not jib_raw):
            skipped += 1
            continue
        if not yn_any(r, trash_cols):
            continue

        jibeon = format_jibeon(jib_raw or road_raw)
        road = format_road(road_raw, jib_raw)
        blob = f"{name} {road} {jibeon}"
        if not yeosu_in_text(blob):
            skipped += 1
            continue

        if lat is None or lng is None or not in_yeosu_bbox(lat, lng):
            print(f"[좌표 제외] {name}\t{road}", file=sys.stderr)
            skipped += 1
            continue

        dk = f"{name}|{road}"
        if dk in seen:
            continue
        seen.add(dk)

        rid = hashlib.sha1(f"{name}\n{road}".encode()).hexdigest()[:20]
        out.append(
            {
                "id": f"jeonnam-yeosu-trash-{rid}",
                "name": name,
                "lat": round(lat, 7),
                "lng": round(lng, 7),
                "roadAddress": road,
                "address": jibeon,
                "businessStatus": "영업",
                "hasTrashBag": True,
                "hasSpecialBag": False,
                "hasLargeWasteSticker": yn_any(r, sticker_cols),
                "adminVerified": True,
                "dataReferenceDate": ref_date,
            }
        )

    out.sort(key=lambda x: (x["name"], x["roadAddress"]))
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    stickers = sum(1 for x in out if x["hasLargeWasteSticker"])
    print(
        f"wrote {len(out)} → {OUT_JSON} "
        f"(ref_date={path_ref}, 스티커 {stickers}, skip={skipped})"
    )

    if out:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from append_activity import record_region_data_added

        record_region_data_added(["여수시"])


if __name__ == "__main__":
    main()
