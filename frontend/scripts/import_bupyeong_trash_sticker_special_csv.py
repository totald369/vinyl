#!/usr/bin/env python3
"""
인천 부평구 종량제봉투 판매정보 CSV -> stores.incheon-bupyeong-trash-sticker-special.json

매핑:
- 종량제봉투취급여부 == Y -> hasTrashBag
- 대형폐기물스티커취급여부 == Y -> hasLargeWasteSticker
- 특수규격봉투취급여부 == Y -> hasSpecialBag (불연성마대)
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
    / "인천광역시 부평구_종량제봉투 판매정보_20250915.csv"
)
FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = (
    FRONTEND / "public" / "data" / "stores.incheon-bupyeong-trash-sticker-special.json"
)
SHORT_CODE_RE = re.compile(r"^[a-zA-Z0-9]{6}$")


def decode_csv(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp949", "euc-kr", "utf-8"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("cp949", errors="replace")


def yn(v: str | None) -> bool:
    return (v or "").strip().upper() == "Y"


def normalize_addr(addr: str) -> str:
    a = " ".join((addr or "").replace("\xa0", " ").split())
    if not a:
        return a
    if a.startswith("인천광역시 부평구"):
        return a
    if a.startswith("인천 부평구"):
        return "인천광역시 부평구 " + a[7:].strip()
    if a.startswith("부평구"):
        return "인천광역시 " + a
    if a.startswith("인천광역시"):
        return a
    return f"인천광역시 부평구 {a}"


def load_existing_meta(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    out: dict[str, dict[str, str]] = {}
    if not isinstance(rows, list):
        return out
    for row in rows:
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

    dedup: dict[str, dict] = {}
    for r in reader:
        name = (r.get("판매처명") or "").strip()
        addr = normalize_addr((r.get("소재지 주소") or "").strip())
        if not name or not addr:
            continue
        k = f"{name.lower()}|{addr.lower()}"
        t = yn(r.get("종량제봉투취급여부"))
        s = yn(r.get("대형폐기물스티커취급여부"))
        sp = yn(r.get("특수규격봉투취급여부"))
        if k not in dedup:
            dedup[k] = {
                "name": " ".join(name.split()),
                "roadAddress": addr,
                "hasTrashBag": t,
                "hasLargeWasteSticker": s,
                "hasSpecialBag": sp,
            }
        else:
            dedup[k]["hasTrashBag"] = bool(dedup[k]["hasTrashBag"] or t)
            dedup[k]["hasLargeWasteSticker"] = bool(dedup[k]["hasLargeWasteSticker"] or s)
            dedup[k]["hasSpecialBag"] = bool(dedup[k]["hasSpecialBag"] or sp)

    existing_meta = load_existing_meta(OUT_JSON)
    ref = "2025-09-15"
    today = date.today().isoformat()
    out: list[dict] = []
    for i, r in enumerate(sorted(dedup.values(), key=lambda x: (x["name"], x["roadAddress"])), start=1):
        sid = f"bupyeong-bags-{i:04d}"
        rec = {
            "id": sid,
            "name": r["name"],
            "roadAddress": r["roadAddress"],
            "address": "인천광역시 부평구",
            "businessStatus": "영업",
            "hasTrashBag": bool(r["hasTrashBag"]),
            "hasSpecialBag": bool(r["hasSpecialBag"]),
            "hasLargeWasteSticker": bool(r["hasLargeWasteSticker"]),
            "adminVerified": True,
            "dataReferenceDate": existing_meta.get(sid, {}).get("dataReferenceDate", ref or today),
        }
        sc = existing_meta.get(sid, {}).get("shortCode")
        if sc:
            rec["shortCode"] = sc
        out.append(rec)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"wrote {len(out)} rows -> {OUT_JSON} "
        f"(종량제 {sum(1 for x in out if x['hasTrashBag'])}, "
        f"스티커 {sum(1 for x in out if x['hasLargeWasteSticker'])}, "
        f"특수규격 {sum(1 for x in out if x['hasSpecialBag'])})"
    )


if __name__ == "__main__":
    main()
