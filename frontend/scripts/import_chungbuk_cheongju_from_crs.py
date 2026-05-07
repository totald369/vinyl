#!/usr/bin/env python3
"""
청주시 종량제·불연성 등 판매처 — 공개 CRS API → stores.chungbuk-cheongju-trash.json

원본 UI: https://crs.cjuc.or.kr/mobile/mob03001.do
데이터: POST /com/commonProcList.do (PR_GARTB_ORDR01_LIST / LIST007)

item_list 텍스트에서 플래그 추출:
- 봉투일반·봉투 재사용(재사용) → hasTrashBag (일반 종량제봉투 계열)
- 전용마대(20·40ℓ 등) → hasSpecialBag (불연성 전용마대)
API의 map_x = 위도, map_y = 경도 (카카오 좌표 기준).

※ 음식물납부필증 등은 앱 스키마(대형폐기물 스티커)와 의미가 달라 본 데이터셋에서는 플래그로 넣지 않음.
"""

from __future__ import annotations

import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

CRS_LIST_URL = "https://crs.cjuc.or.kr/com/commonProcList.do"
FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.chungbuk-cheongju-trash.json"


def fetch_rows() -> list[dict]:
    data = urllib.parse.urlencode(
        {
            "proc_nm": "PR_GARTB_ORDR01_LIST",
            "action_type": "LIST007",
            "param01": "",
            "param02": "",
            "param03": "1",
            "param04": "",
            "param05": "",
            "param06": "",
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        CRS_LIST_URL,
        data=data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "User-Agent": "Mozilla/5.0 (compatible; VinylMapImport/1.0)",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    rows = body.get("data")
    if not isinstance(rows, list):
        return []
    return [r for r in rows if isinstance(r, dict)]


def ymd_to_iso(s: str | None) -> str | None:
    if not s or len(str(s).strip()) != 8:
        return None
    d = str(s).strip()
    if not d.isdigit():
        return None
    return f"{d[:4]}-{d[4:6]}-{d[6:8]}"


def flags_from_item_list(text: str) -> tuple[bool, bool]:
    """hasTrashBag, hasSpecialBag — 재사용 봉투는 일반 종량제 매장으로 간주"""
    t = text or ""
    has_trash = bool(
        re.search(r"봉투\s*일반", t)
        or re.search(r"봉투일반", t)
        or re.search(r"봉투\s*재사용", t)
        or re.search(r"봉투재사용", t)
    )
    has_special = "전용마대" in t
    return has_trash, has_special


def in_cheongju_bbox(lat: float, lng: float) -> bool:
    return 36.42 <= lat <= 36.82 and 127.30 <= lng <= 127.70


def main() -> None:
    raw_rows = fetch_rows()
    default_date = "2026-01-01"
    out: list[dict] = []

    seen: set[str] = set()
    for r in raw_rows:
        cust_cd = str(r.get("cust_cd") or "").strip()
        if not cust_cd or cust_cd in seen:
            continue
        seen.add(cust_cd)

        try:
            lat = float(str(r.get("map_x") or "").strip())
            lng = float(str(r.get("map_y") or "").strip())
        except ValueError:
            continue
        if not in_cheongju_bbox(lat, lng):
            continue

        name = " ".join(str(r.get("cust_nm") or "").split())
        if not name:
            continue

        addr = " ".join(str(r.get("addr") or "").split())
        item_list = str(r.get("item_list") or "")
        has_trash, has_special = flags_from_item_list(item_list)

        tel = str(r.get("tel_no") or "").strip()
        ref = ymd_to_iso(str(r.get("deliver_ymd") or "")) or default_date

        rid = f"chungbuk-cheongju-trash-{cust_cd}"
        rec: dict = {
            "id": rid,
            "name": name,
            "lat": round(lat, 7),
            "lng": round(lng, 7),
            "roadAddress": addr,
            "address": "충청북도 청주시",
            "businessStatus": "영업",
            "hasTrashBag": has_trash,
            "hasSpecialBag": has_special,
            "hasLargeWasteSticker": False,
            "adminVerified": True,
            "dataReferenceDate": ref,
        }
        if tel:
            rec["phone"] = tel
        out.append(rec)

    out.sort(key=lambda x: (x["name"], x.get("roadAddress", "")))
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(out)} rows -> {OUT_JSON} (API returned {len(raw_rows)})")


if __name__ == "__main__":
    main()
