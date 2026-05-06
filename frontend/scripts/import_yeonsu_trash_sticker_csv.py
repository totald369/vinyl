#!/usr/bin/env python3
"""
인천 연수구 종량제봉투 및 스티커 판매소 CSV -> stores.incheon-yeonsu-trash-sticker.json

매핑:
- "종량제일반용" == "Y" -> hasTrashBag = True
- "스티커" == "Y" -> hasLargeWasteSticker = True
"""

from __future__ import annotations

import csv
import json
import re
from datetime import date
from pathlib import Path

DOWNLOAD_CSV = (
    Path.home()
    / "Downloads"
    / "인천광역시 연수구_종량제봉투 및 스티커 판매소 현황_20260318.csv"
)
FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.incheon-yeonsu-trash-sticker.json"
SHORT_CODE_RE = re.compile(r"^[a-zA-Z0-9]{6}$")


def decode_csv(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp949", "euc-kr", "utf-8"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("cp949", errors="replace")


def norm_addr(road: str, jibun: str) -> str:
    r = " ".join((road or "").replace("\xa0", " ").split())
    j = " ".join((jibun or "").replace("\xa0", " ").split())
    base = r or j
    if not base:
        return ""
    if base.startswith("인천광역시 연수구"):
        return base
    if base.startswith("인천 연수구"):
        return "인천광역시 연수구 " + base[7:].strip()
    if base.startswith("연수구"):
        return "인천광역시 " + base
    if base.startswith("인천광역시"):
        return base
    return f"인천광역시 연수구 {base}"


def parse_float(v: str) -> float | None:
    try:
        return float((v or "").strip())
    except ValueError:
        return None


def load_existing_meta(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    try:
        arr = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    out: dict[str, dict[str, str]] = {}
    if not isinstance(arr, list):
        return out
    for row in arr:
        if not isinstance(row, dict) or not row.get("id"):
            continue
        rid = str(row["id"])
        meta: dict[str, str] = {}
        sc = row.get("shortCode")
        if isinstance(sc, str) and SHORT_CODE_RE.match(sc.strip()):
            meta["shortCode"] = sc.strip()
        dr = row.get("dataReferenceDate")
        if isinstance(dr, str) and dr.strip():
            meta["dataReferenceDate"] = dr.strip()
        if meta:
            out[rid] = meta
    return out


def main() -> None:
    if not DOWNLOAD_CSV.exists():
        raise SystemExit(f"CSV 없음: {DOWNLOAD_CSV}")
    text = decode_csv(DOWNLOAD_CSV.read_bytes())
    reader = csv.DictReader(text.splitlines())
    rows: list[dict] = []
    for r in reader:
        name = (r.get("판매소명 ") or r.get("판매소명") or "").strip()
        road = (r.get("주소(도로명)") or "").strip()
        jibun = (r.get("주소(번지)") or "").strip()
        lat = parse_float(r.get("위도") or "")
        lng = parse_float(r.get("경도") or "")
        has_trash = (r.get("종량제일반용") or "").strip().upper() == "Y"
        has_sticker = (r.get("스티커") or "").strip().upper() == "Y"
        phone = (r.get("전화번호") or "").strip()
        addr = norm_addr(road, jibun)
        if not name or not addr or lat is None or lng is None:
            continue
        if not (37.33 <= lat <= 37.49 and 126.58 <= lng <= 126.80):
            continue
        rows.append(
            {
                "name": " ".join(name.split()),
                "roadAddress": addr,
                "lat": round(lat, 7),
                "lng": round(lng, 7),
                "phone": phone,
                "hasTrashBag": has_trash,
                "hasLargeWasteSticker": has_sticker,
            }
        )

    dedup: dict[str, dict] = {}
    for r in rows:
        k = f"{r['name'].lower()}|{r['roadAddress'].lower()}"
        if k not in dedup:
            dedup[k] = r
        else:
            dedup[k]["hasTrashBag"] = bool(dedup[k]["hasTrashBag"] or r["hasTrashBag"])
            dedup[k]["hasLargeWasteSticker"] = bool(
                dedup[k]["hasLargeWasteSticker"] or r["hasLargeWasteSticker"]
            )
            if not dedup[k].get("phone") and r.get("phone"):
                dedup[k]["phone"] = r["phone"]

    existing_meta = load_existing_meta(OUT_JSON)
    ref = "2026-03-18"
    today = date.today().isoformat()
    out: list[dict] = []
    for i, r in enumerate(sorted(dedup.values(), key=lambda x: (x["name"], x["roadAddress"])), start=1):
        sid = f"yeonsu-trash-{i:04d}"
        rec = {
            "id": sid,
            "name": r["name"],
            "lat": r["lat"],
            "lng": r["lng"],
            "roadAddress": r["roadAddress"],
            "address": "인천광역시 연수구",
            "businessStatus": "영업",
            "hasTrashBag": bool(r["hasTrashBag"]),
            "hasSpecialBag": False,
            "hasLargeWasteSticker": bool(r["hasLargeWasteSticker"]),
            "adminVerified": True,
            "dataReferenceDate": existing_meta.get(sid, {}).get("dataReferenceDate", ref or today),
        }
        ph = (r.get("phone") or "").strip()
        if ph:
            rec["phone"] = ph
        sc = existing_meta.get(sid, {}).get("shortCode")
        if sc:
            rec["shortCode"] = sc
        out.append(rec)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    t = sum(1 for r in out if r["hasTrashBag"])
    s = sum(1 for r in out if r["hasLargeWasteSticker"])
    print(f"wrote {len(out)} rows -> {OUT_JSON} (종량제 {t}, 스티커 {s})")


if __name__ == "__main__":
    main()
