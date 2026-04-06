#!/usr/bin/env python3
"""
화성시 GBMS 지도 판매소 API → stores.sample.json 병합.

원본: https://61.251.29.212/Gbms_Map/select_map.jsp?attr=hwasung
- GET proc/getdong.jsp?attr=hwasung
- GET proc/getbag.jsp?attr=hwasung
- GET proc/getsale_list.jsp?dong=…&bag=…&shop=&attr=hwasung  (XML + CDATA 안 JS 객체 배열)

플래그 (BAG_KIND):
- 종량제봉투류(소각/매립/사업장/재사용/음식물 등) → hasTrashBag
- 공사장생활폐기물포대 80666 → hasSpecialBag (불연성 마대)
- 스티커 70707/70717/70747 → hasLargeWasteSticker

동일 판매소는 이름+주소(정규화) 기준 병합, 플래그는 OR.

사용:
  python3 scripts/import_hwaseong_gbms_map.py --dry-run
  python3 scripts/import_hwaseong_gbms_map.py
"""

from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

BASE = "https://61.251.29.212/Gbms_Map"
ATTR = "hwasung"
FRONTEND = Path(__file__).resolve().parent.parent
DEFAULT_MERGE = FRONTEND / "public" / "data" / "stores.sample.json"
DEFAULT_OUT = FRONTEND / "public" / "data" / "hwaseong-gbms-import.json"

REQUEST_DELAY = 0.12

# getbag.jsp 기준
BAG_TRASH = {
    "10122",
    "10132",
    "10152",
    "10172",
    "10192",
    "20122",
    "20132",
    "20152",
    "20172",
    "30172",
    "30192",
    "50122",
    "50132",
    "50152",
    "60092",
    "60112",
    "60122",
    "60132",
    "60152",
}
BAG_SPECIAL = {"80666"}  # 공사장생활폐기물포대
BAG_STICKER = {"70707", "70717", "70747"}


def ssl_ctx() -> ssl.SSLContext:
    c = ssl.create_default_context()
    c.check_hostname = False
    c.verify_mode = ssl.CERT_NONE
    return c


def fetch_url(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; vinyl-data-import/1.0)"},
    )
    with urllib.request.urlopen(req, timeout=90, context=ssl_ctx()) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_xml_cdata_array(xml_text: str) -> list[dict]:
    """getsale_list.jsp 응답에서 CDATA 배열 파싱."""
    try:
        root = ET.fromstring(xml_text)
        code_el = root.find(".//code")
        if code_el is None or (code_el.text or "").strip() != "success":
            return []
    except ET.ParseError:
        return []
    m = re.search(r"<!\[CDATA\[(.*?)\]\]>", xml_text, re.DOTALL)
    if not m:
        return []
    inner = m.group(1).strip()
    if not inner.startswith("["):
        return []
    rows: list[dict] = []
    for mobj in re.finditer(r"\{([^}]*)\}", inner, re.DOTALL):
        block = mobj.group(1)
        d: dict[str, str] = {}
        for km in re.finditer(r"(\w+)\s*:\s*'([^']*)'", block):
            d[km.group(1)] = km.group(2)
        for km in re.finditer(r"(\w+)\s*:\s*([0-9.Ee+-]+)", block):
            k = km.group(1)
            if k not in d:
                d[k] = km.group(2)
        if d:
            rows.append(d)
    return rows


def fetch_dong_codes() -> list[tuple[str, str]]:
    xml_text = fetch_url(f"{BASE}/proc/getdong.jsp?attr={ATTR}")
    m = re.search(r"<!\[CDATA\[(.*?)\]\]>", xml_text, re.DOTALL)
    if not m:
        return []
    inner = m.group(1)
    out: list[tuple[str, str]] = []
    for mobj in re.finditer(r"\{([^}]*)\}", inner):
        block = mobj.group(1)
        ck = re.search(r"CODE_KIND\s*:\s*'([^']*)'", block)
        cn = re.search(r"CODE_NAME\s*:\s*'([^']*)'", block)
        if ck and cn:
            out.append((cn.group(1), ck.group(1)))
    return out


def fetch_bag_codes() -> list[tuple[str, str]]:
    xml_text = fetch_url(f"{BASE}/proc/getbag.jsp?attr={ATTR}")
    m = re.search(r"<!\[CDATA\[(.*?)\]\]>", xml_text, re.DOTALL)
    if not m:
        return []
    inner = m.group(1)
    out: list[tuple[str, str]] = []
    for mobj in re.finditer(r"\{([^}]*)\}", inner):
        block = mobj.group(1)
        bk = re.search(r"BAG_KIND\s*:\s*'([^']*)'", block)
        bn = re.search(r"BAG_NAME\s*:\s*'([^']*)'", block)
        if bk and bn:
            out.append((bn.group(1), bk.group(1)))
    return out


def fetch_sale_list(dong_code: str, bag_code: str) -> list[dict]:
    q = urllib.parse.urlencode(
        {"dong": dong_code, "bag": bag_code, "shop": "", "attr": ATTR}
    )
    xml_text = fetch_url(f"{BASE}/proc/getsale_list.jsp?{q}")
    return parse_xml_cdata_array(xml_text)


def norm_store_name(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").strip().lower())
    return f"{norm_store_name(name).lower()}|{a}"


def normalize_hwaseong_road(addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").replace("\n", " ").strip())
    if not a:
        return a
    if a.startswith("경기도"):
        return a
    if a.startswith("경기 "):
        return "경기도 " + a[3:].lstrip()
    if a.startswith("화성시"):
        return "경기도 " + a
    return f"경기도 화성시 {a}"


def parse_sale_date(ymd: str | None) -> str | None:
    if not ymd:
        return None
    s = str(ymd).strip()
    if len(s) >= 8 and s[:8].isdigit():
        s = s[:8]
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
    return None


def row_to_partial(row: dict) -> dict | None:
    name = (row.get("SHOP_NAME") or "").strip()
    raw_addr = (row.get("SAUP_ADDR") or "").strip()
    road = normalize_hwaseong_road(raw_addr)
    if not name or not road:
        return None
    # 동·품목 조회 시 관외(타 시·군) 행이 섞이는 경우 제외
    if "화성시" not in road:
        return None
    try:
        lat = float(row.get("WEDO") or 0)
        lng = float(row.get("KGDO") or 0)
    except (TypeError, ValueError):
        return None
    if abs(lat) < 1e-6 and abs(lng) < 1e-6:
        return None
    ref = parse_sale_date(row.get("SALE_DATE"))
    return {
        "name": name,
        "roadAddress": road,
        "address": road,
        "lat": lat,
        "lng": lng,
        "dataReferenceDate": ref,
    }


def flags_for_bag(bag_code: str) -> tuple[bool, bool, bool]:
    if bag_code in BAG_SPECIAL:
        return False, True, False
    if bag_code in BAG_STICKER:
        return False, False, True
    if bag_code in BAG_TRASH:
        return True, False, False
    return False, False, False


def in_hwaseong_bbox(lat: float, lng: float) -> bool:
    return 36.95 <= lat <= 37.45 and 126.50 <= lng <= 127.55


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
        if not in_hwaseong_bbox(la, ln):
            continue
        k0 = norm_key(s["name"], s["roadAddress"])
        if k0 in exist_keys:
            for e in existing:
                if norm_key(e.get("name", ""), e.get("roadAddress") or e.get("address", "")) != k0:
                    continue
                ch = False
                if s.get("hasSpecialBag") and not e.get("hasSpecialBag"):
                    e["hasSpecialBag"] = True
                    ch = True
                if s.get("hasTrashBag") and not e.get("hasTrashBag"):
                    e["hasTrashBag"] = True
                    ch = True
                if s.get("hasLargeWasteSticker") and not e.get("hasLargeWasteSticker"):
                    e["hasLargeWasteSticker"] = True
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
            "businessStatus": "영업",
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


def scrape_all() -> dict[str, dict]:
    dongs = fetch_dong_codes()
    bags = fetch_bag_codes()
    if not dongs or not bags:
        raise RuntimeError("동/봉투 목록을 가져오지 못했습니다.")

    bag_codes = [b[1] for b in bags]
    unknown = [bc for bc in bag_codes if bc not in BAG_TRASH | BAG_SPECIAL | BAG_STICKER]
    if unknown:
        print(f"경고: 알 수 없는 BAG_KIND 무시: {unknown}", file=sys.stderr)

    agg: dict[str, dict] = {}
    total_calls = len(dongs) * len(bag_codes)
    n = 0
    for dong_name, dong_code in dongs:
        for bag_name, bag_code in bags:
            if bag_code not in BAG_TRASH | BAG_SPECIAL | BAG_STICKER:
                continue
            ht, hs, hk = flags_for_bag(bag_code)
            try:
                rows = fetch_sale_list(dong_code, bag_code)
            except (urllib.error.URLError, OSError) as e:
                print(f"  실패 dong={dong_name} bag={bag_code}: {e}", file=sys.stderr)
                rows = []
            n += 1
            if n % 80 == 0:
                print(f"  … API {n}/{total_calls} (누적 업소 {len(agg)})", file=sys.stderr)
            for row in rows:
                p = row_to_partial(row)
                if not p:
                    continue
                k = norm_key(p["name"], p["roadAddress"])
                if k not in agg:
                    agg[k] = {
                        **p,
                        "hasTrashBag": False,
                        "hasSpecialBag": False,
                        "hasLargeWasteSticker": False,
                    }
                rec = agg[k]
                if ht:
                    rec["hasTrashBag"] = True
                if hs:
                    rec["hasSpecialBag"] = True
                if hk:
                    rec["hasLargeWasteSticker"] = True
                rd = p.get("dataReferenceDate")
                if rd:
                    old = rec.get("dataReferenceDate") or ""
                    if not old or rd > old:
                        rec["dataReferenceDate"] = rd
            time.sleep(REQUEST_DELAY)
    return agg


def main() -> None:
    ap = argparse.ArgumentParser(description="화성 GBMS 지도 판매소 → StoreData 병합")
    ap.add_argument("--merge-into", type=Path, default=DEFAULT_MERGE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print("화성 GBMS 동/봉투 목록 로드…", file=sys.stderr)
    agg = scrape_all()
    rows = list(agg.values())
    t = sum(1 for r in rows if r["hasTrashBag"])
    sp = sum(1 for r in rows if r["hasSpecialBag"])
    st = sum(1 for r in rows if r["hasLargeWasteSticker"])
    print(
        f"고유 판매소 {len(rows)}건 (종량제 {t}, 포대 {sp}, 스티커 {st})",
        file=sys.stderr,
    )

    if args.dry_run:
        for r in rows[:20]:
            fl = []
            if r["hasTrashBag"]:
                fl.append("종량제")
            if r["hasSpecialBag"]:
                fl.append("포대")
            if r["hasLargeWasteSticker"]:
                fl.append("스티커")
            print(f"  [{'/'.join(fl)}] {r['name']} | {r['roadAddress']}")
        if len(rows) > 20:
            print(f"  … 외 {len(rows) - 20}건", file=sys.stderr)
        return

    export = [
        {
            "name": r["name"],
            "lat": r["lat"],
            "lng": r["lng"],
            "roadAddress": r["roadAddress"],
            "address": r["address"],
            "businessStatus": "영업",
            "hasTrashBag": r["hasTrashBag"],
            "hasSpecialBag": r["hasSpecialBag"],
            "hasLargeWasteSticker": r["hasLargeWasteSticker"],
            "adminVerified": False,
            **(
                {"dataReferenceDate": r["dataReferenceDate"]}
                if r.get("dataReferenceDate")
                else {}
            ),
        }
        for r in rows
    ]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(export, f, ensure_ascii=False, indent=2)
    print(f"저장: {args.out} ({len(export)}건)", file=sys.stderr)

    added, updated = merge_into_existing(export, args.merge_into.expanduser().resolve())
    print(f"병합: 신규 {added}건, 기존 갱신 {updated}건 → {args.merge_into}")


if __name__ == "__main__":
    main()
