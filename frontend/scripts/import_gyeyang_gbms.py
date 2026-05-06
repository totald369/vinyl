#!/usr/bin/env python3
"""
계양구 GBMS 지도 판매소 API -> stores.incheon-gyeyang-gbms.json

원본: https://61.251.29.212/Gbms_Map/select_map.jsp?attr=gy

매핑:
- BAG_NAME startswith "일반"   -> hasTrashBag (일반 종량제)
- BAG_NAME startswith "불연성" -> hasSpecialBag (불연성 마대)
- BAG_NAME startswith "스티커" -> hasLargeWasteSticker (폐기물 스티커)
"""

from __future__ import annotations

import json
import re
import ssl
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

BASE = "https://61.251.29.212/Gbms_Map"
ATTR = "gy"
FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.incheon-gyeyang-gbms.json"
SHORT_CODE_RE = re.compile(r"^[a-zA-Z0-9]{6}$")


def ssl_ctx() -> ssl.SSLContext:
    c = ssl.create_default_context()
    c.check_hostname = False
    c.verify_mode = ssl.CERT_NONE
    return c


def fetch_text(url: str) -> str:
    req = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; vinyl-import/1.0)"}
    )
    with urllib.request.urlopen(req, timeout=90, context=ssl_ctx()) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_cdata_objects(xml_text: str) -> list[dict[str, str]]:
    m = re.search(r"<!\[CDATA\[(.*?)\]\]>", xml_text, re.DOTALL)
    if not m:
        return []
    inner = m.group(1).strip()
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
    out: list[tuple[str, str]] = []
    for r in parse_cdata_objects(xml):
        name = (r.get("CODE_NAME") or "").strip()
        code = (r.get("CODE_KIND") or "").strip()
        if name and code:
            out.append((name, code))
    return out


def fetch_bag_codes() -> list[tuple[str, str]]:
    xml = fetch_text(f"{BASE}/proc/getbag.jsp?attr={ATTR}")
    out: list[tuple[str, str]] = []
    for r in parse_cdata_objects(xml):
        name = (r.get("BAG_NAME") or "").strip()
        code = (r.get("BAG_KIND") or "").strip()
        if name and code:
            out.append((name, code))
    return out


def fetch_sale_rows(dong_code: str, bag_code: str) -> list[dict[str, str]]:
    q = urllib.parse.urlencode(
        {"dong": dong_code, "bag": bag_code, "shop": "", "attr": ATTR}
    )
    xml = fetch_text(f"{BASE}/proc/getsale_list.jsp?{q}")
    return parse_cdata_objects(xml)


def normalize_addr(addr: str) -> str:
    a = " ".join((addr or "").replace("\xa0", " ").split())
    a = re.sub(r",\s*$", "", a).strip()
    if not a:
        return a
    if a.startswith("인천광역시 계양구"):
        return a
    if a.startswith("인천 계양구"):
        return "인천광역시 계양구 " + a[7:].strip()
    if a.startswith("계양구"):
        return "인천광역시 " + a
    return f"인천광역시 계양구 {a}"


def parse_date(ymd: str | None) -> str | None:
    s = (ymd or "").strip()
    if len(s) >= 8 and s[:8].isdigit():
        s = s[:8]
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"
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
    dongs = fetch_dong_codes()
    bags = fetch_bag_codes()
    if not dongs or not bags:
        raise SystemExit("계양구 GBMS 동/봉투 목록 조회 실패")

    bag_flags: dict[str, tuple[bool, bool, bool]] = {}
    for name, code in bags:
        if name.startswith("일반"):
            bag_flags[code] = (True, False, False)
        elif name.startswith("불연성"):
            bag_flags[code] = (False, True, False)
        elif name.startswith("스티커"):
            bag_flags[code] = (False, False, True)

    if not bag_flags:
        raise SystemExit("매핑 가능한 BAG_NAME(일반/불연성/스티커) 없음")

    agg: dict[str, dict] = {}
    jobs = [(dn, dc, bc) for dn, dc in dongs for bc in bag_flags]
    for idx, (dong_name, dong_code, bag_code) in enumerate(jobs, start=1):
        t, s, st = bag_flags[bag_code]
        rows = fetch_sale_rows(dong_code, bag_code)
        for row in rows:
            name = (row.get("SHOP_NAME") or "").strip()
            addr = normalize_addr((row.get("SAUP_ADDR") or "").strip())
            if not name or not addr:
                continue
            try:
                lat = float(row.get("WEDO") or 0)
                lng = float(row.get("KGDO") or 0)
            except (TypeError, ValueError):
                continue
            if abs(lat) < 1e-6 and abs(lng) < 1e-6:
                continue
            if not (37.50 <= lat <= 37.62 and 126.67 <= lng <= 126.80):
                continue
            k = f"{name.lower()}|{addr.lower()}"
            if k not in agg:
                agg[k] = {
                    "name": " ".join(name.split()),
                    "roadAddress": addr,
                    "lat": round(lat, 7),
                    "lng": round(lng, 7),
                    "phone": (row.get("PHONE") or row.get("SAUP_PHONE") or "").strip(),
                    "hasTrashBag": False,
                    "hasSpecialBag": False,
                    "hasLargeWasteSticker": False,
                    "dataReferenceDate": parse_date(row.get("SALE_DATE")),
                }
            rec = agg[k]
            if t:
                rec["hasTrashBag"] = True
            if s:
                rec["hasSpecialBag"] = True
            if st:
                rec["hasLargeWasteSticker"] = True
            rd = parse_date(row.get("SALE_DATE"))
            if rd and ((not rec.get("dataReferenceDate")) or rd > rec["dataReferenceDate"]):
                rec["dataReferenceDate"] = rd
        if idx % 8 == 0 or idx == len(jobs):
            print(f"  ... {idx}/{len(jobs)} API 호출, 누적 {len(agg)}건")
        time.sleep(0.08)

    existing_meta = load_existing_meta(OUT_JSON)
    today = date.today().isoformat()
    out: list[dict] = []
    for i, r in enumerate(sorted(agg.values(), key=lambda x: (x["name"], x["roadAddress"])), start=1):
        sid = f"gyeyang-gbms-{i:04d}"
        rec = {
            "id": sid,
            "name": r["name"],
            "lat": r["lat"],
            "lng": r["lng"],
            "roadAddress": r["roadAddress"],
            "address": "인천광역시 계양구",
            "businessStatus": "영업",
            "hasTrashBag": bool(r["hasTrashBag"]),
            "hasSpecialBag": bool(r["hasSpecialBag"]),
            "hasLargeWasteSticker": bool(r["hasLargeWasteSticker"]),
            "adminVerified": True,
            "dataReferenceDate": existing_meta.get(sid, {}).get(
                "dataReferenceDate", r.get("dataReferenceDate") or today
            ),
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
    print(
        f"wrote {len(out)} rows -> {OUT_JSON} "
        f"(일반 {sum(1 for x in out if x['hasTrashBag'])}, "
        f"불연성 {sum(1 for x in out if x['hasSpecialBag'])}, "
        f"스티커 {sum(1 for x in out if x['hasLargeWasteSticker'])})"
    )


if __name__ == "__main__":
    main()
