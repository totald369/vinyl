#!/usr/bin/env python3
"""
종로구 findstore.kr 종량제 지도 데이터 → stores.sample.json 병합.

원본: https://findstore.kr/map/FindStore_jongno.html
데이터: https://findstore.kr/map/js/jongno/data.js (var url = [ ... ] ; JSON 배열)

- hasTrashBag: 메뉴에 「생활용」+ 수량, 또는 good_id 에 #1~#5(리터 규격 봉투 코드)
- hasSpecialBag: 메뉴에 「특수종량제」+ 수량 (PP포대)
- 좌표·주소는 원본(lat/lng, doaddr) 사용 (별도 지오코딩 없음)
- 위 두 플래그가 모두 False 인 행은 목록에 올라와도 생활/특수 판매로 볼 수 없어 병합에서 제외

사용:
  python3 scripts/import_jongno_findstore.py
  python3 scripts/import_jongno_findstore.py --include-all   # 플래그 없어도 전 행 추가(둘 다 false)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

DATA_URL = "https://findstore.kr/map/js/jongno/data.js"
FRONTEND = Path(__file__).resolve().parent.parent
DEFAULT_MERGE = FRONTEND / "public" / "data" / "stores.sample.json"
DEFAULT_OUT = FRONTEND / "public" / "data" / "jongno-findstore-import.json"

HOUSE_GOOD_TOKENS = frozenset({"1", "2", "3", "4", "5"})


def norm_store_name(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").strip().lower())
    return f"{norm_store_name(name).lower()}|{a}"


def normalize_jongno_road(addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").replace("\n", " ").strip())
    if not a:
        return a
    if a.startswith("서울특별시"):
        return a
    if a.startswith("서울시"):
        return "서울특별시" + a[3:].lstrip()
    if a.startswith("서울 "):
        rest = a[3:].lstrip()
        if rest.startswith("종로구"):
            return f"서울특별시 {rest}"
        return f"서울특별시 종로구 {rest}"
    if a.startswith("종로구"):
        return f"서울특별시 {a}"
    return f"서울특별시 종로구 {a}"


def _good_tokens(good_id: str) -> set[str]:
    if not good_id:
        return set()
    return {p.strip("#") for p in good_id.split("_") if p.strip("#")}


def has_household_from_menu(menu_list: dict | None) -> bool:
    if not menu_list:
        return False
    for t in menu_list.values():
        t = t or ""
        if "생활용" in t and re.search(r"【[^】]*\d", t):
            return True
    return False


def has_special_from_menu(menu_list: dict | None) -> bool:
    if not menu_list:
        return False
    for t in menu_list.values():
        t = t or ""
        if "특수종량제" in t and re.search(r"【[^】]*\d", t):
            return True
    return False


def has_household_from_good_id(good_id: str) -> bool:
    return bool(_good_tokens(good_id) & HOUSE_GOOD_TOKENS)


def flags_for_record(rec: dict) -> tuple[bool, bool]:
    m = rec.get("menuList")
    h = has_household_from_menu(m) or has_household_from_good_id(rec.get("good_id") or "")
    s = has_special_from_menu(m)
    return h, s


def fetch_data_js(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; vinyl-data-import/1.0)"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_url_array(js_text: str) -> list[dict]:
    t = js_text.strip()
    t = re.sub(r"^\s*var\s+url\s*=\s*", "", t, flags=re.I).strip()
    t = t.rstrip(";").strip()
    return json.loads(t)


def in_jongno_bbox(lat: float, lng: float) -> bool:
    return 37.55 <= lat <= 37.62 and 126.93 <= lng <= 127.05


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
        if not in_jongno_bbox(float(s["lat"]), float(s["lng"])):
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
                if s.get("dataReferenceDate"):
                    od = e.get("dataReferenceDate") or ""
                    if (not od or s["dataReferenceDate"] > od) and s["dataReferenceDate"] != od:
                        e["dataReferenceDate"] = s["dataReferenceDate"]
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
            "hasLargeWasteSticker": False,
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
    ap = argparse.ArgumentParser(description="종로 findstore → StoreData 병합")
    ap.add_argument(
        "--url",
        default=DATA_URL,
        help="data.js URL (캐시 무력화는 ?날짜 쿼리 추가 가능)",
    )
    ap.add_argument(
        "--merge-into",
        type=Path,
        default=DEFAULT_MERGE,
        help="병합 대상 stores JSON",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="수집 결과 단독 JSON",
    )
    ap.add_argument(
        "--include-all",
        action="store_true",
        help="생활/특수 미판별 행도 추가(hasTrashBag/hasSpecialBag 둘 다 false일 수 있음)",
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
        road = normalize_jongno_road((rec.get("doaddr") or "").strip())
        ji = (rec.get("jiaddr") or "").strip()
        lat, lng = rec.get("lat"), rec.get("lng")
        try:
            lat_f = float(lat) if lat is not None else None
            lng_f = float(lng) if lng is not None else None
        except (TypeError, ValueError):
            lat_f = lng_f = None
        if not name or not road or lat_f is None or lng_f is None:
            continue
        ht, hs = flags_for_record(rec)
        if not args.include_all and not ht and not hs:
            continue
        last = (rec.get("last") or "").strip()
        ref = last if re.match(r"^\d{4}-\d{2}-\d{2}$", last) else None
        built.append(
            {
                "name": name,
                "roadAddress": road,
                "address": normalize_jongno_road(ji) if ji else road,
                "lat": lat_f,
                "lng": lng_f,
                "hasTrashBag": ht,
                "hasSpecialBag": hs,
                "dataReferenceDate": ref,
            }
        )

    print(
        f"원본 {len(rows_raw)}건 → 병합 후보 {len(built)}건 "
        f"(include_all={args.include_all})",
        file=sys.stderr,
    )
    if args.dry_run:
        t = sum(1 for x in built if x["hasTrashBag"])
        s = sum(1 for x in built if x["hasSpecialBag"])
        print(f"  생활용(일반 종량제) {t}, 특수종량제(마대) {s}", file=sys.stderr)
        for x in built[:12]:
            f = []
            if x["hasTrashBag"]:
                f.append("생활")
            if x["hasSpecialBag"]:
                f.append("특수")
            print(f"  [{'/'.join(f)}] {x['name']} | {x['roadAddress']}")
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
                    "hasLargeWasteSticker": False,
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
