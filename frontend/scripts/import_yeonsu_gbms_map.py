#!/usr/bin/env python3
"""
인천 연수구 GBMS 지도 판매소 API → public/data/stores.incheon-yeonsu-gbms.json

원본: http://27.101.43.143/Gbms_Map/select_map.jsp?attr=yeonsu
- GET proc/getdong.jsp?attr=yeonsu
- GET proc/getbag.jsp?attr=yeonsu
- GET proc/getsale_list.jsp?dong=…&bag=…&shop=&attr=yeonsu

매핑 규칙(요청 반영):
- BAG_NAME startswith "일반용"/"사업계용" -> hasTrashBag (종량제봉투)
- BAG_NAME startswith "마대"           -> hasSpecialBag (불연성마대)
- BAG_NAME startswith "필증"           -> hasLargeWasteSticker (대형폐기물 스티커)
- 그 외(음식물 등)는 제외

사용:
  cd frontend
  python3 scripts/import_yeonsu_gbms_map.py
  npm run shortcodes:assign
"""

from __future__ import annotations

import argparse
import json
import re
import ssl
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

BASE = "http://27.101.43.143/Gbms_Map"
ATTR = "yeonsu"
FRONTEND = Path(__file__).resolve().parent.parent
OUT_DEFAULT = FRONTEND / "public" / "data" / "stores.incheon-yeonsu-gbms.json"
REQUEST_DELAY = 0.08
SHORT_CODE_RE = re.compile(r"^[a-zA-Z0-9]{6}$")


def ssl_ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def fetch_text(url: str) -> str:
    req = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; vinyl-import/1.0)"}
    )
    with urllib.request.urlopen(req, timeout=90, context=ssl_ctx()) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_js_object_array_from_cdata(xml_text: str) -> list[dict[str, str]]:
    m = re.search(r"<!\[CDATA\[(.*?)\]\]>", xml_text, re.DOTALL)
    if not m:
        return []
    inner = m.group(1).strip()
    if not inner.startswith("["):
        return []
    rows: list[dict[str, str]] = []
    for obj in re.finditer(r"\{([^}]*)\}", inner, re.DOTALL):
        block = obj.group(1)
        d: dict[str, str] = {}
        for km in re.finditer(r"(\w+)\s*:\s*'([^']*)'", block):
            d[km.group(1)] = km.group(2)
        for km in re.finditer(r"(\w+)\s*:\s*([0-9.Ee+-]+)", block):
            if km.group(1) not in d:
                d[km.group(1)] = km.group(2)
        if d:
            rows.append(d)
    return rows


def fetch_dong_codes() -> list[tuple[str, str]]:
    xml = fetch_text(f"{BASE}/proc/getdong.jsp?attr={ATTR}")
    rows = parse_js_object_array_from_cdata(xml)
    out: list[tuple[str, str]] = []
    for r in rows:
        name = (r.get("CODE_NAME") or "").strip()
        code = (r.get("CODE_KIND") or "").strip()
        if name and code:
            out.append((name, code))
    return out


def fetch_bag_codes() -> list[tuple[str, str]]:
    xml = fetch_text(f"{BASE}/proc/getbag.jsp?attr={ATTR}")
    rows = parse_js_object_array_from_cdata(xml)
    out: list[tuple[str, str]] = []
    for r in rows:
        name = (r.get("BAG_NAME") or "").strip()
        code = (r.get("BAG_KIND") or "").strip()
        if name and code:
            out.append((name, code))
    return out


def fetch_sale_list(dong_code: str, bag_code: str) -> list[dict[str, str]]:
    q = urllib.parse.urlencode(
        {"dong": dong_code, "bag": bag_code, "shop": "", "attr": ATTR}
    )
    xml = fetch_text(f"{BASE}/proc/getsale_list.jsp?{q}")
    return parse_js_object_array_from_cdata(xml)


def parse_sale_date(ymd: str | None) -> str | None:
    if not ymd:
        return None
    s = str(ymd).strip()
    if len(s) >= 8 and s[:8].isdigit():
        s = s[:8]
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
    return None


def normalize_yeonsu_address(addr: str) -> str:
    a = " ".join((addr or "").replace("\xa0", " ").split())
    a = re.sub(r",\s*.*$", "", a)
    a = re.sub(r"\s*\([^)]*\)\s*$", "", a)
    if not a:
        return a
    if a.startswith("인천광역시 연수구"):
        return a
    if a.startswith("인천 연수구"):
        return "인천광역시 연수구 " + a[len("인천 연수구") :].strip()
    if a.startswith("연수구"):
        return "인천광역시 " + a
    if a.startswith("인천광역시"):
        return a
    return f"인천광역시 연수구 {a}"


def norm_store_name(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    n = norm_store_name(name).lower()
    a = re.sub(r"\s+", " ", (addr or "").strip().lower())
    return f"{n}|{a}"


def pick_phone(row: dict[str, str]) -> str | None:
    for k in ("SAUP_PHONE", "PHONE"):
        p = (row.get(k) or "").strip()
        if p and re.search(r"\d", p):
            return p
    return None


def flags_for_bag(bag_name: str) -> tuple[bool, bool, bool]:
    if bag_name.startswith("마대"):
        return False, True, False
    if bag_name.startswith("필증"):
        return False, False, True
    if bag_name.startswith("일반용") or bag_name.startswith("사업계용"):
        return True, False, False
    return False, False, False


def in_yeonsu_bbox(lat: float, lng: float) -> bool:
    # 송도·옥련·청학 포함
    return 37.34 <= lat <= 37.46 and 126.58 <= lng <= 126.74


def load_existing_meta(out_path: Path) -> dict[str, dict[str, str]]:
    if not out_path.exists():
        return {}
    try:
        data = json.loads(out_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, list):
        return {}
    out: dict[str, dict[str, str]] = {}
    for row in data:
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
    ap = argparse.ArgumentParser(description="연수구 GBMS 판매소 → stores.incheon-yeonsu-gbms.json")
    ap.add_argument("-o", "--out", type=Path, default=OUT_DEFAULT)
    args = ap.parse_args()

    out_path = args.out if args.out.is_absolute() else (FRONTEND / args.out)
    iso_today = date.today().isoformat()

    dongs = fetch_dong_codes()
    bags = fetch_bag_codes()
    if not dongs or not bags:
        raise SystemExit("연수 GBMS 동/봉투 목록을 가져오지 못했습니다.")

    bag_map: dict[str, tuple[bool, bool, bool]] = {}
    for name, code in bags:
        flags = flags_for_bag(name)
        if any(flags):
            bag_map[code] = flags

    if not bag_map:
        raise SystemExit("매핑 가능한 봉투 코드가 없습니다.")

    agg: dict[str, dict] = {}
    jobs = [
        (dong_name, dong_code, bag_code)
        for dong_name, dong_code in dongs
        for bag_code in bag_map
    ]
    for i, (dong_name, dong_code, bag_code) in enumerate(jobs, start=1):
        rows = fetch_sale_list(dong_code, bag_code)
        has_trash, has_special, has_sticker = bag_map[bag_code]
        for row in rows:
            name = (row.get("SHOP_NAME") or "").strip()
            addr = normalize_yeonsu_address((row.get("SAUP_ADDR") or "").strip())
            if not name or not addr:
                continue
            try:
                lat = float(row.get("WEDO") or 0)
                lng = float(row.get("KGDO") or 0)
            except (TypeError, ValueError):
                continue
            if abs(lat) < 1e-6 and abs(lng) < 1e-6:
                continue
            if not in_yeonsu_bbox(lat, lng):
                continue
            k = norm_key(name, addr)
            if k not in agg:
                agg[k] = {
                    "name": norm_store_name(name),
                    "roadAddress": addr,
                    "address": addr,
                    "lat": round(lat, 7),
                    "lng": round(lng, 7),
                    "hasTrashBag": False,
                    "hasSpecialBag": False,
                    "hasLargeWasteSticker": False,
                    "phone": pick_phone(row),
                    "dataReferenceDate": parse_sale_date(row.get("SALE_DATE")),
                }
            rec = agg[k]
            if has_trash:
                rec["hasTrashBag"] = True
            if has_special:
                rec["hasSpecialBag"] = True
            if has_sticker:
                rec["hasLargeWasteSticker"] = True
            rd = parse_sale_date(row.get("SALE_DATE"))
            if rd and ((not rec.get("dataReferenceDate")) or rd > rec["dataReferenceDate"]):
                rec["dataReferenceDate"] = rd
            if not rec.get("phone"):
                rec["phone"] = pick_phone(row)
        if i % 12 == 0 or i == len(jobs):
            print(f"  … {i}/{len(jobs)} 호출, 누적 고유 업소 {len(agg)}")
        time.sleep(REQUEST_DELAY)

    existing_meta = load_existing_meta(out_path)
    rows = sorted(agg.values(), key=lambda x: (x["name"], x["roadAddress"]))
    out: list[dict] = []
    for i, r in enumerate(rows, start=1):
        sid = f"yeonsu-gbms-{i:04d}"
        rec = {
            "id": sid,
            "name": r["name"],
            "lat": r["lat"],
            "lng": r["lng"],
            "roadAddress": r["roadAddress"],
            "address": r["address"],
            "businessStatus": "영업",
            "hasTrashBag": bool(r["hasTrashBag"]),
            "hasSpecialBag": bool(r["hasSpecialBag"]),
            "hasLargeWasteSticker": bool(r["hasLargeWasteSticker"]),
            "adminVerified": True,
            "dataReferenceDate": existing_meta.get(sid, {}).get(
                "dataReferenceDate", r.get("dataReferenceDate") or iso_today
            ),
        }
        ph = r.get("phone")
        if isinstance(ph, str) and ph.strip():
            rec["phone"] = ph.strip()
        sc = existing_meta.get(sid, {}).get("shortCode")
        if sc:
            rec["shortCode"] = sc
        out.append(rec)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    trash_cnt = sum(1 for r in out if r["hasTrashBag"])
    special_cnt = sum(1 for r in out if r["hasSpecialBag"])
    sticker_cnt = sum(1 for r in out if r["hasLargeWasteSticker"])
    print(
        f"wrote {len(out)} rows -> {out_path} "
        f"(종량제 {trash_cnt}, 불연성마대 {special_cnt}, 스티커 {sticker_cnt})"
    )


if __name__ == "__main__":
    main()
