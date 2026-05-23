#!/usr/bin/env python3
"""
전라남도 화순군 종량제봉투 지정판매소 CSV → stores.jeonnam-hwasun-trash.json

입력: 상호명, 소재지도로명주소, 소재지지번주소, 위도, 경도, 데이터기준일

  python3 scripts/import_jeonnam_hwasun_trash_from_csv.py \\
    --input ~/Downloads/전라남도\\ 화순군_쓰레기종량제봉투\\ 지정판매소\\ 현황_20250914.csv
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
OUT_JSON = FRONTEND / "public" / "data" / "stores.jeonnam-hwasun-trash.json"
DL = Path.home() / "Downloads"
DEFAULT_INPUT = DL / "전라남도 화순군_쓰레기종량제봉투 지정판매소 현황_20250914.csv"
REF_DATE = "2025-09-14"

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


def in_hwasun_bbox(lat: float, lng: float) -> bool:
    return 34.50 <= lat <= 35.22 and 126.50 <= lng <= 127.15


def hwasun_in_text(blob: str) -> bool:
    return "화순" in (blob or "").replace(" ", "")


def format_addr(raw: str) -> str:
    a = collapse(raw)
    a = re.sub(r"^전남\s+", "전라남도 ", a)
    if not a:
        return ""
    if a.startswith("전라남도"):
        return a
    if a.startswith("화순군"):
        return f"전라남도 {a}"
    return f"전라남도 화순군 {a}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    args = ap.parse_args()
    inp: Path = args.input.expanduser()
    if not inp.exists():
        raise SystemExit(f"CSV 없음: {inp}")

    path_ref = ref_date_from_path(inp)
    text = decode_csv(inp.read_bytes())
    out: list[dict] = []
    seen: set[str] = set()
    skipped = 0

    for r in csv.DictReader(text.splitlines()):
        name = collapse(r.get("상호명") or "")
        road_raw = collapse(r.get("소재지도로명주소") or "")
        jib_raw = collapse(r.get("소재지지번주소") or "")
        ref_date = collapse(r.get("데이터기준일") or "") or path_ref
        lat = parse_float(r.get("위도"))
        lng = parse_float(r.get("경도"))

        if not name or (not road_raw and not jib_raw):
            skipped += 1
            continue

        road = format_addr(road_raw or jib_raw)
        jibeon = format_addr(jib_raw or road_raw)
        blob = f"{name} {road} {jibeon}"
        if not hwasun_in_text(blob):
            skipped += 1
            continue

        if lat is None or lng is None or not in_hwasun_bbox(lat, lng):
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
                "id": f"jeonnam-hwasun-trash-{rid}",
                "name": name,
                "lat": round(lat, 7),
                "lng": round(lng, 7),
                "roadAddress": road,
                "address": jibeon,
                "businessStatus": "영업",
                "hasTrashBag": True,
                "hasSpecialBag": False,
                "hasLargeWasteSticker": False,
                "adminVerified": True,
                "dataReferenceDate": ref_date,
            }
        )

    out.sort(key=lambda x: (x["name"], x["roadAddress"]))
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(out)} → {OUT_JSON} (ref_date={path_ref}, skip={skipped})")

    if out:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from append_activity import record_region_data_added

        record_region_data_added(["화순군"])


if __name__ == "__main__":
    main()
