#!/usr/bin/env python3
"""
경기도 광주시 종량제 지정판매소 — findstore.kr FindStore_gumc (data.js)

원본 URL: https://findstore.kr/map/FindStore_gumc.html
데이터:     https://findstore.kr/map/js/gumc/data.js

※ 페이지·주소 표기상 「경기 광주시」이며 광주광역시(광역시)와는 다른 지역입니다.

플래그(원천 문자열 기준):
  - 종량제봉투(hasTrashBag): menuList 각 slist 안에 「소각용」「재사용」「음식물」 중 하나와
    실제 규격/수량 문자(숫자 등)가 있을 때 True
  - 불연성마대(hasSpecialBag): 「불연성」「불연」 + 수량 패턴
  - 대형폐기물스티커(hasLargeWasteSticker): 「대형폐기물」「대형폐기」 + 수량 패턴

  python3 scripts/import_gyeonggi_gwangju_findstore.py
"""

from __future__ import annotations

import json
import math
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.gyeonggi-gwangju-findstore.json"

DATA_JS_URL = "https://findstore.kr/map/js/gumc/data.js"
USER_AGENT = "Mozilla/5.0 (compatible; VinylMapImport/1.1)"


def collapse(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def fetch_data_js(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8")


def parse_js_array(payload: str) -> list:
    body = collapse(payload.replace("\ufeff", ""))
    body = re.sub(r"^\s*var\s+url\s*=\s*", "", body, flags=re.I).strip()
    if body.endswith(";"):
        body = body[:-1].strip()
    return json.loads(body)


def ml_lines(menu_list: dict) -> list[tuple[str, str]]:
    if not menu_list:
        return []
    out: list[tuple[str, str]] = []
    for k in sorted(menu_list.keys(), key=lambda x: (len(x), x)):
        if not str(k).startswith("slist"):
            continue
        v = collapse(str(menu_list.get(k) or ""))
        if v:
            out.append((k, v))
    return out


def line_has_stock(text: str) -> bool:
    t = collapse(text)
    if len(t) < 3:
        return False
    return bool(re.search(r"\d", t))


def classify_flags(menu_list: dict) -> tuple[bool, bool, bool]:
    """
    (hasTrashBag, hasSpecialBag, hasLargeWasteSticker)
    종량제: 소각용·재사용·음식물 (사용자 요청에 맞춰 소각+재사용 핵심, 음식물은 동일 포털 종량제군으로 포함)
    """
    has_trash = has_special = has_sticker = False
    for _k, line in ml_lines(menu_list):
        if not line_has_stock(line):
            continue
        if "소각용" in line or "재사용" in line or "음식물" in line:
            has_trash = True
        if "대형폐기물" in line or "대형폐기" in line:
            has_sticker = True
        if ("불연성" in line or "불연" in line) and (
            "마대" in line or "리터" in line or "매" in line
        ):
            has_special = True
    return has_trash, has_special, has_sticker


def fmt_phone(raw: object) -> str:
    if raw is None:
        return ""
    s = collapse(str(raw))
    if not s:
        return ""
    if re.match(r"^031-\d{3,4}-\d{4}$", s):
        return s
    digits = re.sub(r"\D", "", s)
    if digits.startswith("031") and len(digits) == 10:
        return f"031-{digits[3:7]}-{digits[7:]}"
    if digits.startswith("031") and len(digits) == 11:
        return f"031-{digits[3:6]}-{digits[6:]}"
    if len(digits) == 8 and digits.startswith("031"):
        return f"031-{digits[3:]}"
    return s


def iso_date_maybe(s: str) -> str:
    """last 필드 yyyy-mm-dd"""
    s = collapse(s)
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s
    return ""


def to_latlng(v: object) -> float | None:
    try:
        f = float(v)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


GWANGJU_ADDR = re.compile(r"(경기도|경기)\s+광주시")


def ensure_road(addr: str) -> str:
    s = collapse(addr)
    if s.startswith("경기 광주"):
        s = "경기도 " + s[len("경기 ") :]
    elif s.startswith("경기도 광주"):
        pass
    return s


def in_gwangju_si(doaddr: str, jiaddr: str) -> bool:
    """맵 번들에 타 시·구 분점이 포함될 수 있어 행정구역으로 제한."""
    for blk in (doaddr, jiaddr):
        if blk and GWANGJU_ADDR.search(blk):
            return True
    return False


def main() -> None:
    print(f"다운로드 {DATA_JS_URL}", file=sys.stderr)
    raw = fetch_data_js(DATA_JS_URL)
    rows = parse_js_array(raw)
    print(f"파싱 {len(rows)}건", file=sys.stderr)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    stores: list[dict] = []

    sorted_rows = sorted(
        rows,
        key=lambda r: (
            r.get("lat") or 0,
            r.get("lng") or 0,
            collapse(str(r.get("jiaddr") or "")),
            collapse(str(r.get("sname") or "")),
        ),
    )

    skipped_oob = 0
    kept_no = 0
    for r in sorted_rows:
        lat = to_latlng(r.get("lat"))
        lng = to_latlng(r.get("lng"))
        name = collapse(str(r.get("sname") or ""))
        raw_do = str(r.get("doaddr") or "")
        raw_ji = str(r.get("jiaddr") or "")
        if not in_gwangju_si(raw_do, raw_ji):
            skipped_oob += 1
            continue
        road = ensure_road(raw_do)
        if not road:
            road = ensure_road(raw_ji)
        if lat is None or lng is None or not name:
            continue

        kept_no += 1
        menu = r.get("menuList") if isinstance(r.get("menuList"), dict) else {}
        ht, hs, hst = classify_flags(menu)
        oid = f"gyeonggi-gwangju-findstore-{kept_no:04d}"

        ref = iso_date_maybe(str(r.get("last") or "")) or today

        obj: dict = {
            "id": oid,
            "name": name,
            "lat": lat,
            "lng": lng,
            "roadAddress": road,
            "address": road,
            "businessStatus": "영업",
            "hasTrashBag": ht,
            "hasSpecialBag": hs,
            "hasLargeWasteSticker": hst,
            "adminVerified": False,
            "dataReferenceDate": ref,
            "sourceVendor": "findstore.kr/map/FindStore_gumc",
        }
        ph = fmt_phone(r.get("tel"))
        if ph:
            obj["phone"] = ph

        gs = collapse(str(r.get("gsale") or ""))
        if gs.isdigit():
            obj["vendorStoreCode"] = gs

        stores.append(obj)

    print(
        "플래그 요약 종량제/불연/스티커 "
        f"{sum(1 for s in stores if s['hasTrashBag'])}/"
        f"{sum(1 for s in stores if s['hasSpecialBag'])}/"
        f"{sum(1 for s in stores if s['hasLargeWasteSticker'])}"
        + (f" · 경기 광주시 외 행 제외 {skipped_oob}건" if skipped_oob else ""),
        file=sys.stderr,
    )

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(stores, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"저장: {OUT_JSON} ({len(stores)}건)", file=sys.stderr)


if __name__ == "__main__":
    main()
