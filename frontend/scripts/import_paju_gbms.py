#!/usr/bin/env python3
"""
파주도시공사 종량제 지정판매소 지도 API → stores.sample.json 병합.

원본: https://garbagebag.pajuutc.or.kr/gbmsWeb/uspc/storeInfo/selectStoreMapList.do
API:  POST /gbmsWeb/usmo/storeInfo/selectStoreInfoListAjax.do
      gseSr, gseSize, sSite(빈값=전체), sText, toLat/fromLat/toLot/fromLot(빈값)

품목 코드(화면 selectSrSize 와 동일):
  - 일반 종량제봉투: gseSr=01, gseSize=150|210|220|230|250|275 (5~75L) → hasTrashBag
  - 불연성(마대) 20L: 03_220 → hasSpecialBag
  - 대형폐기물 스티커: 06_410|420|450 → hasLargeWasteSticker

동일 업소는 upsoNo(또는 wrkpMgtNo) 기준으로 병합하고 플래그는 합칩니다.
좌표·주소는 API 응답(scLat/scLot/scRoad)을 그대로 사용합니다.

사용:
  python3 scripts/import_paju_gbms.py --dry-run
  python3 scripts/import_paju_gbms.py --merge-into public/data/stores.sample.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://garbagebag.pajuutc.or.kr"
AJAX_URL = f"{BASE}/gbmsWeb/usmo/storeInfo/selectStoreInfoListAjax.do"
FRONTEND = Path(__file__).resolve().parent.parent
DEFAULT_MERGE = FRONTEND / "public" / "data" / "stores.sample.json"
DEFAULT_OUT = FRONTEND / "public" / "data" / "paju-gbms-import.json"

# (gseSr, gseSize) 튜플 목록
GENERAL_BAG = [
    ("01", "150"),
    ("01", "210"),
    ("01", "220"),
    ("01", "230"),
    ("01", "250"),
    ("01", "275"),
]
SPECIAL_BAG = [("03", "220")]
STICKER = [("06", "410"), ("06", "420"), ("06", "450")]

REQUEST_DELAY = 0.25


def norm_store_name(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").strip().lower())
    return f"{norm_store_name(name).lower()}|{a}"


def record_merge_key(row: dict) -> str:
    u = row.get("upsoNo") or row.get("wrkpMgtNo")
    road = (row.get("scRoad") or row.get("siteRoad") or "").strip()
    if u is not None and str(u).strip() != "":
        return f"id:{str(u).strip()}|{road.lower()}"
    return norm_key(row.get("scComy") or "", road)


def parse_spy_date(ymd: str | None) -> str | None:
    if not ymd or len(str(ymd).strip()) < 8:
        return None
    s = str(ymd).strip()[:8]
    if not s.isdigit():
        return None
    return f"{s[:4]}-{s[4:6]}-{s[6:8]}"


def row_to_partial(row: dict) -> dict | None:
    name = (row.get("scComy") or "").strip()
    road = (row.get("scRoad") or row.get("siteRoad") or "").strip()
    addr = (row.get("scAddr") or row.get("site") or road).strip()
    if not name or not road:
        return None
    try:
        lat = float(row.get("scLat"))
        lng = float(row.get("scLot"))
    except (TypeError, ValueError):
        return None
    ref = parse_spy_date(row.get("lastSpyYmd"))
    return {
        "_key": record_merge_key(row),
        "name": name,
        "roadAddress": road,
        "address": addr or road,
        "lat": lat,
        "lng": lng,
        "dataReferenceDate": ref,
    }


def in_paju_bbox(lat: float, lng: float) -> bool:
    """카카오 오탐 방지용 거친 범위(파주시 일대)."""
    return 37.60 <= lat <= 38.20 and 126.60 <= lng <= 127.05


def fetch_list(gse_sr: str, gse_size: str) -> list[dict]:
    body = urllib.parse.urlencode(
        {
            "gseSr": gse_sr,
            "gseSize": gse_size,
            "sText": "",
            "sSite": "",
            "toLat": "",
            "fromLat": "",
            "toLot": "",
            "fromLot": "",
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        AJAX_URL,
        data=body,
        method="POST",
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; vinyl-data-import/1.0)",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": f"{BASE}/gbmsWeb/uspc/storeInfo/selectStoreMapList.do",
        },
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    data = json.loads(raw)
    if data.get("code") != "0000":
        raise RuntimeError(data.get("message") or str(data.get("code")))
    return list(data.get("resultList") or [])


def scrape_all() -> dict[str, dict]:
    agg: dict[str, dict] = {}

    def apply(rows: list[dict], *, trash: bool, special: bool, sticker: bool) -> None:
        for row in rows:
            p = row_to_partial(row)
            if not p:
                continue
            k = p.pop("_key")
            if k not in agg:
                agg[k] = {
                    **p,
                    "hasTrashBag": False,
                    "hasSpecialBag": False,
                    "hasLargeWasteSticker": False,
                }
            rec = agg[k]
            if trash:
                rec["hasTrashBag"] = True
            if special:
                rec["hasSpecialBag"] = True
            if sticker:
                rec["hasLargeWasteSticker"] = True
            rd = p.get("dataReferenceDate")
            if rd:
                old = rec.get("dataReferenceDate") or ""
                if not old or rd > old:
                    rec["dataReferenceDate"] = rd

    jobs: list[tuple[str, str, bool, bool, bool]] = []
    for sr, sz in GENERAL_BAG:
        jobs.append((sr, sz, True, False, False))
    for sr, sz in SPECIAL_BAG:
        jobs.append((sr, sz, False, True, False))
    for sr, sz in STICKER:
        jobs.append((sr, sz, False, False, True))

    for i, (sr, sz, t, sp, st) in enumerate(jobs):
        try:
            rows = fetch_list(sr, sz)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, RuntimeError) as e:
            print(f"  요청 실패 gseSr={sr} gseSize={sz}: {e}", file=sys.stderr)
            continue
        apply(rows, trash=t, special=sp, sticker=st)
        print(f"  … {i + 1}/{len(jobs)} ({sr}_{sz}) → {len(rows)}건, 누적 업소 {len(agg)}", file=sys.stderr)
        time.sleep(REQUEST_DELAY)

    return agg


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
        if not in_paju_bbox(float(s["lat"]), float(s["lng"])):
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


def main() -> None:
    ap = argparse.ArgumentParser(description="파주 GBMS 판매소 → StoreData 병합")
    ap.add_argument(
        "--merge-into",
        type=Path,
        default=DEFAULT_MERGE,
        help="병합 대상 (기본: public/data/stores.sample.json)",
    )
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print("파주 GBMS 판매소 수집 중…", file=sys.stderr)
    agg = scrape_all()
    rows = list(agg.values())
    t = sum(1 for r in rows if r["hasTrashBag"])
    sp = sum(1 for r in rows if r["hasSpecialBag"])
    st = sum(1 for r in rows if r["hasLargeWasteSticker"])
    print(
        f"고유 판매소 {len(rows)}건 (일반봉투 {t}, 불연성20L {sp}, 대형스티커 {st})",
        file=sys.stderr,
    )

    if args.dry_run:
        for r in rows[:15]:
            fl = []
            if r["hasTrashBag"]:
                fl.append("일반")
            if r["hasSpecialBag"]:
                fl.append("마대")
            if r["hasLargeWasteSticker"]:
                fl.append("스티커")
            print(f"  [{'/'.join(fl)}] {r['name']} | {r['roadAddress']}")
        if len(rows) > 15:
            print(f"  … 외 {len(rows) - 15}건")
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
    print(f"저장: {args.out} ({len(export)}건)")

    merge_path = args.merge_into.expanduser().resolve()
    added, updated = merge_into_existing(export, merge_path)
    print(f"병합: 신규 {added}건, 기존 갱신 {updated}건 → {merge_path}")


if __name__ == "__main__":
    main()
