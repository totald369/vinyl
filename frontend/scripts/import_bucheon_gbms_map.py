#!/usr/bin/env python3
"""
부천시 GBMS 지도 판매소 API → public/data/stores.bucheon-gbms.json

원본: https://61.251.29.212/Gbms_Map/select_map.jsp?attr=bucheon
- GET proc/getdong.jsp?attr=bucheon
- GET proc/getbag.jsp?attr=bucheon
- GET proc/getsale_list.jsp?dong=…&bag=…&shop=&attr=bucheon

매핑 규칙(요청 반영):
- BAG_NAME startswith "일반용" -> hasTrashBag (일반종량제봉투)
- BAG_NAME startswith "불연재" -> hasSpecialBag (불연성마대)
- 그 외(재사용/음식물)는 이번 데이터셋에서 제외

사용:
  cd frontend
  python3 scripts/import_bucheon_gbms_map.py
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

BASE = "https://61.251.29.212/Gbms_Map"
ATTR = "bucheon"
FRONTEND = Path(__file__).resolve().parent.parent
OUT_DEFAULT = FRONTEND / "public" / "data" / "stores.bucheon-gbms.json"
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


def normalize_bucheon_address(addr: str) -> str:
    a = " ".join((addr or "").replace("\xa0", " ").split())
    if not a:
        return a
    if a.startswith("경기도 부천시"):
        return a
    if a.startswith("경기 부천시"):
        return "경기도 부천시 " + a[6:].strip()
    if a.startswith("부천시"):
        return "경기도 " + a
    return f"경기도 부천시 {a}"


def norm_store_name(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    n = norm_store_name(name).lower()
    a = re.sub(r"\s+", " ", (addr or "").strip().lower())
    return f"{n}|{a}"


def pick_phone(row: dict[str, str]) -> str | None:
    for k in ("PHONE", "SAUP_PHONE"):
        p = (row.get(k) or "").strip()
        if p:
            return p
    return None


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
    ap = argparse.ArgumentParser(description="부천 GBMS 판매소 → stores.bucheon-gbms.json")
    ap.add_argument("-o", "--out", type=Path, default=OUT_DEFAULT)
    args = ap.parse_args()

    out_path = args.out if args.out.is_absolute() else (FRONTEND / args.out)
    existing_meta = load_existing_meta(out_path)
    iso_today = date.today().isoformat()

    dongs = fetch_dong_codes()
    bags = fetch_bag_codes()
    if not dongs or not bags:
        raise SystemExit("부천 GBMS 동/봉투 목록을 가져오지 못했습니다.")

    bag_map: dict[str, tuple[bool, bool]] = {}
    for name, code in bags:
        if name.startswith("일반용"):
            bag_map[code] = (True, False)
        elif name.startswith("불연재"):
            bag_map[code] = (False, True)

    if not bag_map:
        raise SystemExit("매핑 가능한 봉투 코드(일반용/불연재)가 없습니다.")

    agg: dict[str, dict] = {}
    jobs = [(dong_name, dong_code, bag_code) for dong_name, dong_code in dongs for bag_code in bag_map]
    for i, (dong_name, dong_code, bag_code) in enumerate(jobs, start=1):
        rows = fetch_sale_list(dong_code, bag_code)
        has_trash, has_special = bag_map[bag_code]
        for row in rows:
            name = (row.get("SHOP_NAME") or "").strip()
            addr = normalize_bucheon_address((row.get("SAUP_ADDR") or "").strip())
            if not name or not addr:
                continue
            try:
                lat = float(row.get("WEDO") or 0)
                lng = float(row.get("KGDO") or 0)
            except (TypeError, ValueError):
                continue
            if abs(lat) < 1e-6 and abs(lng) < 1e-6:
                continue
            # 부천 외 좌표 오탐 방지용 넓은 bbox
            if not (37.40 <= lat <= 37.62 and 126.68 <= lng <= 126.95):
                continue
            k = norm_key(name, addr)
            if k not in agg:
                agg[k] = {
                    "name": norm_store_name(name),
                    "roadAddress": addr,
                    "address": "경기도 부천시",
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
            rd = parse_sale_date(row.get("SALE_DATE"))
            if rd and ((not rec.get("dataReferenceDate")) or rd > rec["dataReferenceDate"]):
                rec["dataReferenceDate"] = rd
            if not rec.get("phone"):
                rec["phone"] = pick_phone(row)
        if i % 8 == 0 or i == len(jobs):
            print(f"  … {i}/{len(jobs)} 호출, 누적 고유 업소 {len(agg)}")
        time.sleep(REQUEST_DELAY)

    rows = sorted(agg.values(), key=lambda x: (x["name"], x["roadAddress"]))
    out: list[dict] = []
    for i, r in enumerate(rows, start=1):
        sid = f"bucheon-gbms-{i:04d}"
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
            "hasLargeWasteSticker": False,
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
    both_cnt = sum(1 for r in out if r["hasTrashBag"] and r["hasSpecialBag"])
    print(
        f"wrote {len(out)} rows -> {out_path} "
        f"(일반용 {trash_cnt}, 불연재 {special_cnt}, 겸업 {both_cnt})"
    )


if __name__ == "__main__":
    main()
