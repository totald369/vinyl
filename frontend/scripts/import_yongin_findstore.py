#!/usr/bin/env python3
"""
용인특례시 findstore.kr 종량제 지도 → stores.sample.json 병합.

원본: https://findstore.kr/map/FindStore_yuc.html
데이터: /map/js/yuc2/data*.js (HTML에 나열된 스크립트 전부 병합)

플래그 (menuList 텍스트 기준, 【…】 수량 있는 항목만 인정):
- hasTrashBag: 일반전용봉투 / 음식물전용봉투 / 소각용 / 재사용봉투
- hasSpecialBag: 불연성마대 또는 단독 「마대」(대형폐기물 문구 제외)
- hasLargeWasteSticker: 대형폐기물(스티커)

주소: doaddr(+ jiaddr)를 경기도 용인시 형태로 정규화, 원본 lat/lng 사용(undefined/null 행은 제외).

사용:
  python3 scripts/import_yongin_findstore.py --dry-run
  python3 scripts/import_yongin_findstore.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

PAGE_URL = "https://findstore.kr/map/FindStore_yuc.html"
JS_PREFIX = "https://findstore.kr/map/js/yuc2/"
FRONTEND = Path(__file__).resolve().parent.parent
DEFAULT_MERGE = FRONTEND / "public" / "data" / "stores.sample.json"
DEFAULT_OUT = FRONTEND / "public" / "data" / "yongin-findstore-import.json"


def norm_store_name(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").strip().lower())
    return f"{norm_store_name(name).lower()}|{a}"


def normalize_yongin_road(addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").replace("\n", " ").strip())
    if not a:
        return a
    if a.startswith("경기도"):
        return a
    if a.startswith("경기 "):
        return "경기도 " + a[3:].lstrip()
    if a.startswith("용인특례시") or a.startswith("용인시"):
        return "경기도 " + a
    return f"경기도 용인시 {a}"


def _menu_qty(text: str) -> bool:
    return bool(text and re.search(r"【[^】]*\d", text))


def has_trash_from_menu(menu_list: dict | None) -> bool:
    if not menu_list:
        return False
    keys = (
        "일반전용봉투",
        "음식물전용",
        "음식물",
        "소각용",
        "재사용봉투",
        "재사용",
    )
    for t in menu_list.values():
        t = t or ""
        if not _menu_qty(t):
            continue
        if any(k in t for k in keys):
            return True
    return False


def has_special_from_menu(menu_list: dict | None) -> bool:
    if not menu_list:
        return False
    for t in menu_list.values():
        t = t or ""
        if not _menu_qty(t):
            continue
        if "대형폐기물" in t:
            continue
        if "불연성" in t:
            return True
        if "마대" in t and "스티커" not in t:
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


def fetch_text(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; vinyl-data-import/1.0)"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.read().decode("utf-8", errors="replace")


def discover_js_urls() -> list[str]:
    html = fetch_text(PAGE_URL)
    found = re.findall(
        r"https://findstore\.kr/map/js/yuc2/[a-zA-Z0-9_]+\.js", html
    )
    return sorted(set(found))


def sanitize_js_to_json_array(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\bundefined\b", "null", text)
    text = re.sub(r",(\s*])", r"\1", text)
    text = re.sub(r",(\s*})", r"\1", text)
    return text


def parse_js_array(text: str) -> list[dict]:
    text = sanitize_js_to_json_array(text)
    i = text.find("[")
    if i < 0:
        raise ValueError("no [")
    depth = 0
    start = i
    for j in range(i, len(text)):
        if text[j] == "[":
            depth += 1
        elif text[j] == "]":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : j + 1])
    raise ValueError("unbalanced brackets")


def in_yongin_bbox(lat: float, lng: float) -> bool:
    return 37.0 <= lat <= 37.55 and 126.85 <= lng <= 127.45


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
        try:
            la, ln = float(s["lat"]), float(s["lng"])
        except (TypeError, ValueError):
            continue
        if not in_yongin_bbox(la, ln):
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


def main() -> None:
    ap = argparse.ArgumentParser(description="용인특례시 findstore → StoreData 병합")
    ap.add_argument("--merge-into", type=Path, default=DEFAULT_MERGE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument(
        "--include-all",
        action="store_true",
        help="종량제/마대/스티커 모두 없는 행도 추가",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    urls = discover_js_urls()
    if not urls:
        print("HTML에서 yuc2 JS URL 을 찾지 못했습니다.", file=sys.stderr)
        raise SystemExit(1)

    print(f"JS 파일 {len(urls)}개 로드", file=sys.stderr)
    all_rows: list[dict] = []
    for u in urls:
        try:
            raw = fetch_text(u)
            rows = parse_js_array(raw)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as e:
            print(f"건너뜀 {u}: {e}", file=sys.stderr)
            continue
        except (json.JSONDecodeError, ValueError) as e:
            print(f"파싱 실패 {u}: {e}", file=sys.stderr)
            continue
        print(f"  {u.split('/')[-1]}: {len(rows)}건", file=sys.stderr)
        all_rows.extend(rows)

    print(f"원본 합계 {len(all_rows)}건", file=sys.stderr)

    by_key: dict[str, dict] = {}
    for rec in all_rows:
        name = (rec.get("sname") or "").strip()
        road_raw = (rec.get("doaddr") or "").strip()
        road = normalize_yongin_road(road_raw)
        ji = (rec.get("jiaddr") or "").strip()
        lat, lng = rec.get("lat"), rec.get("lng")
        try:
            lat_f = float(lat) if lat is not None else None
            lng_f = float(lng) if lng is not None else None
        except (TypeError, ValueError):
            lat_f = lng_f = None
        if not name or not road:
            continue
        ht, hs, hk = flags_for_record(rec)
        if not args.include_all and not (ht or hs or hk):
            continue
        last = (rec.get("last") or "").strip()
        ref = last if re.match(r"^\d{4}-\d{2}-\d{2}$", last) else None
        ji_norm = normalize_yongin_road(ji) if ji else road
        item = {
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
        k0 = norm_key(name, road)
        if k0 not in by_key:
            by_key[k0] = item
        else:
            prev = by_key[k0]
            for fld in ("hasTrashBag", "hasSpecialBag", "hasLargeWasteSticker"):
                prev[fld] = bool(prev.get(fld)) or bool(item.get(fld))
            pr = prev.get("dataReferenceDate")
            ir = item.get("dataReferenceDate")
            if ir and (not pr or ir > pr):
                prev["dataReferenceDate"] = ir
            if prev.get("lat") is None and item.get("lat") is not None:
                prev["lat"] = item["lat"]
                prev["lng"] = item["lng"]

    built = list(by_key.values())
    print(
        f"중복 제거 후 {len(built)}건 (include_all={args.include_all})",
        file=sys.stderr,
    )

    if args.dry_run:
        t = sum(1 for x in built if x["hasTrashBag"])
        sp = sum(1 for x in built if x["hasSpecialBag"])
        st = sum(1 for x in built if x["hasLargeWasteSticker"])
        sk = sum(
            1
            for x in built
            if x.get("lat") is None or x.get("lng") is None
        )
        print(
            f"  일반·음식물·재사용(종량제) {t}, 불연성/마대 {sp}, 대형폐기물스티커 {st}, 좌표없음 {sk}",
            file=sys.stderr,
        )
        for x in built[:15]:
            fl = []
            if x["hasTrashBag"]:
                fl.append("종량제")
            if x["hasSpecialBag"]:
                fl.append("마대")
            if x["hasLargeWasteSticker"]:
                fl.append("스티커")
            print(f"  [{'/'.join(fl)}] {x['name']} | {x['roadAddress']}")
        if len(built) > 15:
            print(f"  … 외 {len(built) - 15}건", file=sys.stderr)
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
    print(f"저장: {args.out} ({len(built)}건)", file=sys.stderr)

    added, updated = merge_into_existing(built, args.merge_into.expanduser().resolve())
    print(f"병합: 신규 {added}건, 기존 갱신 {updated}건 → {args.merge_into}")


if __name__ == "__main__":
    main()
