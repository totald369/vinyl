#!/usr/bin/env python3
"""
경기도 광주시 findstore.kr 종량제 지도 → stores.sample.json 병합.

원본: https://findstore.kr/map/FindStore_gumc.html
데이터: https://findstore.kr/map/js/gumc/data.js (var url = [ ... ])

- hasTrashBag: 메뉴에 「소각용」+ 수량(【…】 내 숫자) — 일반 종량제봉투에 해당
- hasSpecialBag: 「불연성」/「불연성마대」+ 수량 — 불연성 마대
- hasLargeWasteSticker: 「대형폐기물」+ 수량 — 대형폐기물 스티커
- 주소는 doaddr/jiaddr 를 경기도 광주시 형태로 정규화, 좌표는 원본 사용

세 플래그가 모두 False 인 행(메뉴 비어 있음 등)은 기본 제외. --include-all 로 전체 추가 가능.

사용:
  python3 scripts/import_gyeonggi_gwangju_findstore.py --dry-run
  python3 scripts/import_gyeonggi_gwangju_findstore.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

DATA_URL = "https://findstore.kr/map/js/gumc/data.js"
FRONTEND = Path(__file__).resolve().parent.parent
DEFAULT_MERGE = FRONTEND / "public" / "data" / "stores.sample.json"
DEFAULT_OUT = FRONTEND / "public" / "data" / "gwangju-gyeonggi-findstore-import.json"


def norm_store_name(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").strip().lower())
    return f"{norm_store_name(name).lower()}|{a}"


def normalize_gwangju_gg_road(addr: str) -> str:
    """경기 광주시 → 경기도 광주시 (광주광역시와 구분)."""
    a = re.sub(r"\s+", " ", (addr or "").replace("\n", " ").strip())
    if not a:
        return a
    if a.startswith("경기도"):
        return a
    if a.startswith("경기 "):
        return "경기도 " + a[3:].lstrip()
    if a.startswith("경기광주") or a.startswith("경기 광주"):
        return re.sub(r"^경기\s*", "경기도 ", a, count=1)
    if re.match(r"^광주시\s", a):
        return f"경기도 {a}"
    return f"경기도 광주시 {a}"


def _menu_qty(text: str) -> bool:
    return bool(text and re.search(r"【[^】]*\d", text))


def has_trash_from_menu(menu_list: dict | None) -> bool:
    if not menu_list:
        return False
    for t in menu_list.values():
        t = t or ""
        if "소각용" in t and _menu_qty(t):
            return True
    return False


def has_special_from_menu(menu_list: dict | None) -> bool:
    if not menu_list:
        return False
    for t in menu_list.values():
        t = t or ""
        if "불연성" in t and _menu_qty(t):
            return True
    return False


def has_sticker_from_menu(menu_list: dict | None) -> bool:
    if not menu_list:
        return False
    for t in menu_list.values():
        t = t or ""
        if "대형폐기물" in t and _menu_qty(t):
            return True
    return False


def flags_for_record(rec: dict) -> tuple[bool, bool, bool]:
    m = rec.get("menuList")
    return (
        has_trash_from_menu(m),
        has_special_from_menu(m),
        has_sticker_from_menu(m),
    )


def fetch_data_js(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; vinyl-data-import/1.0)"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_url_array(js_text: str) -> list[dict]:
    t = js_text.strip()
    t = re.sub(r"^\s*var\s+url\s*=\s*", "", t, flags=re.I).strip()
    t = t.rstrip(";").strip()
    return json.loads(t)


def in_gwangju_gyeonggi_bbox(lat: float, lng: float) -> bool:
    """경기 광주시 일대(광주광역시와 혼동 방지)."""
    return 37.25 <= lat <= 37.50 and 127.15 <= lng <= 127.45


def merge_into_existing(
    incoming: list[dict],
    merge_path: Path,
) -> tuple[int, int]:
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
        if not in_gwangju_gyeonggi_bbox(float(s["lat"]), float(s["lng"])):
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
    ap = argparse.ArgumentParser(description="경기 광주시 findstore → StoreData 병합")
    ap.add_argument("--url", default=DATA_URL)
    ap.add_argument("--merge-into", type=Path, default=DEFAULT_MERGE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument(
        "--include-all",
        action="store_true",
        help="소각/불연/대형 스티커 미판별 행도 추가",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print(f"다운로드: {args.url}", file=sys.stderr)
    try:
        raw = fetch_data_js(str(args.url))
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as e:
        print(f"다운로드 실패: {e}", file=sys.stderr)
        raise SystemExit(1)

    try:
        rows_raw = parse_url_array(raw)
    except json.JSONDecodeError as e:
        print(f"JSON 파싱 실패: {e}", file=sys.stderr)
        raise SystemExit(1)

    built: list[dict] = []
    for rec in rows_raw:
        name = (rec.get("sname") or "").strip()
        road_raw = (rec.get("doaddr") or "").strip()
        road = normalize_gwangju_gg_road(road_raw)
        ji = (rec.get("jiaddr") or "").strip()
        lat, lng = rec.get("lat"), rec.get("lng")
        try:
            lat_f = float(lat) if lat is not None else None
            lng_f = float(lng) if lng is not None else None
        except (TypeError, ValueError):
            lat_f = lng_f = None
        if not name or not road or lat_f is None or lng_f is None:
            continue
        ht, hs, hk = flags_for_record(rec)
        if not args.include_all and not (ht or hs or hk):
            continue
        last = (rec.get("last") or "").strip()
        ref = last if re.match(r"^\d{4}-\d{2}-\d{2}$", last) else None
        ji_norm = normalize_gwangju_gg_road(ji) if ji else road
        built.append(
            {
                "name": name,
                "roadAddress": road,
                "address": ji_norm,
                "lat": lat_f,
                "lng": lng_f,
                "hasTrashBag": ht,
                "hasSpecialBag": hs,
                "hasLargeWasteSticker": hk,
                "dataReferenceDate": ref,
            }
        )

    print(
        f"원본 {len(rows_raw)}건 → 병합 후보 {len(built)}건 (include_all={args.include_all})",
        file=sys.stderr,
    )
    if args.dry_run:
        t = sum(1 for x in built if x["hasTrashBag"])
        sp = sum(1 for x in built if x["hasSpecialBag"])
        st = sum(1 for x in built if x["hasLargeWasteSticker"])
        print(f"  소각용(일반) {t}, 불연성마대 {sp}, 대형폐기물스티커 {st}", file=sys.stderr)
        for x in built[:12]:
            fl = []
            if x["hasTrashBag"]:
                fl.append("소각")
            if x["hasSpecialBag"]:
                fl.append("마대")
            if x["hasLargeWasteSticker"]:
                fl.append("스티커")
            print(f"  [{'/'.join(fl)}] {x['name']} | {x['roadAddress']}")
        if len(built) > 12:
            print(f"  … 외 {len(built) - 12}건")
        return

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(
            [
                {
                    **x,
                    "businessStatus": "영업",
                    "adminVerified": False,
                }
                for x in built
            ],
            f,
            ensure_ascii=False,
            indent=2,
        )
    print(f"저장: {args.out} ({len(built)}건)")

    added, updated = merge_into_existing(built, args.merge_into.expanduser().resolve())
    print(f"병합: 신규 {added}건, 기존 갱신 {updated}건 → {args.merge_into}")


if __name__ == "__main__":
    main()
