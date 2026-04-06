#!/usr/bin/env python3
"""
서울 관악구 JMT 종량제봉투 판매소 지도 → stores.sample.json 병합.

원본: https://gwanakgu.jmtwaste.kr/jmfwaste/bongtuSellerMap/dist/
API: GET .../jmfwaste/part/common/commonCompany/selectValidBongtuSellers
     ?latitude=&longitude=&radius=&minusMonths=&piCode=

품목 정의는 .../productInfo/productInfo/productInfos 의 pcCode/pcdCode 기준.

플래그 (각 매장의 pbios 항목):
- hasTrashBag: pcCode 101 이고 pcdCode 100·200·300·450 (일반/음식/재사용/공공용봉투)
  또는 pcCode 102 (공공기관·소형음식점 등 해당 구에서 파는 봉투)
- hasSpecialBag: pcCode 101 이고 pcdCode 400 (특수용봉투 PP마대)
- hasLargeWasteSticker: pcCode 120 이고 pcdCode 200 (대형폐기물 스티커)

주소: API address 는 지번 없이 짧은 도로명만 오는 경우가 많아
      roadAddress = "서울특별시 관악구 " + address

사용:
  python3 scripts/import_gwanak_jmtwaste.py --dry-run
  python3 scripts/import_gwanak_jmtwaste.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://gwanakgu.jmtwaste.kr/jmfwaste/part/common/commonCompany/selectValidBongtuSellers"
FRONTEND = Path(__file__).resolve().parent.parent
DEFAULT_MERGE = FRONTEND / "public" / "data" / "stores.sample.json"
DEFAULT_OUT = FRONTEND / "public" / "data" / "gwanak-jmtwaste-import.json"

# 관악구 중심부 근처 (API는 구청 호스트로 구 고정, 좌표 박스는 오탐 방지용)
def in_gwanak_bbox(lat: float, lng: float) -> bool:
    return 37.43 <= lat <= 37.52 and 126.88 <= lng <= 127.02


def norm_store_name(name: str) -> str:
    return re.sub(r"\s*\(\d+\)\s*$", "", (name or "").strip()).strip()


def norm_key(name: str, addr: str) -> str:
    a = re.sub(r"\s+", " ", (addr or "").strip().lower())
    return f"{norm_store_name(name).lower()}|{a}"


def normalize_gwanak_road(short_addr: str) -> str:
    a = re.sub(r"\s+", " ", (short_addr or "").replace("\n", " ").strip())
    if not a:
        return a
    if a.startswith("서울"):
        return a
    return f"서울특별시 관악구 {a}"


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; vinyl-data-import/1.0)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def flags_from_pbios(pbios: list[dict] | None) -> tuple[bool, bool, bool]:
    """(hasTrashBag, hasSpecialBag, hasLargeWasteSticker)

    pbios 가 비어 있으면 최근 입출고만 없는 경우로 보고, 이 API는 유효 종량제
    판매소만 내므로 hasTrashBag 는 True 로 둔다(PP마대·대형은 거래 있을 때만 True).
    """
    ht = hs = hk = False
    if not pbios:
        return True, False, False
    for p in pbios:
        pc = str(p.get("pcCode") or "")
        pcd = str(p.get("pcdCode") or "")
        if pc == "101":
            if pcd in ("100", "200", "300", "450"):
                ht = True
            elif pcd == "400":
                hs = True
        elif pc == "102":
            ht = True
        elif pc == "120" and pcd == "200":
            hk = True
    return ht, hs, hk


def ref_date_from_pbios(pbios: list[dict] | None) -> str | None:
    """pbios inOutDate / georaeDate 밀리초 중 최댓값 → UTC 기준 YYYY-MM-DD."""
    best: int | None = None
    if not pbios:
        return None
    for p in pbios:
        for key in ("inOutDate", "georaeDate", "regDttm", "lastUpdateDttm"):
            v = p.get(key)
            if v is None:
                continue
            try:
                iv = int(v)
            except (TypeError, ValueError):
                continue
            if best is None or iv > best:
                best = iv
    if best is None:
        return None
    try:
        dt = datetime.fromtimestamp(best / 1000.0, tz=timezone.utc)
        return dt.strftime("%Y-%m-%d")
    except (OSError, OverflowError, ValueError):
        return None


def record_to_item(m: dict) -> dict | None:
    name = (m.get("comName") or "").strip()
    short = (m.get("address") or "").strip()
    if not name:
        return None
    road = normalize_gwanak_road(short) if short else ""
    if not road:
        return None
    lat, lng = m.get("latitude"), m.get("longitude")
    try:
        lat_f = float(lat) if lat is not None else None
        lng_f = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        lat_f = lng_f = None
    ht, hs, hk = flags_from_pbios(m.get("pbios"))
    ref = ref_date_from_pbios(m.get("pbios"))
    return {
        "name": name,
        "roadAddress": road,
        "address": road,
        "lat": lat_f,
        "lng": lng_f,
        "hasTrashBag": ht,
        "hasSpecialBag": hs,
        "hasLargeWasteSticker": hk,
        "dataReferenceDate": ref,
    }


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
        if not in_gwanak_bbox(la, ln):
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


def fetch_sellers(lat: float, lng: float, radius: int, minus_months: int) -> list[dict]:
    q = urllib.parse.urlencode(
        {
            "latitude": lat,
            "longitude": lng,
            "radius": radius,
            "minusMonths": minus_months,
            "piCode": "",
        }
    )
    url = f"{BASE}?{q}"
    data = fetch_json(url)
    out = data.get("output") or {}
    obj = out.get("object") or {}
    models = obj.get("models")
    if not isinstance(models, list):
        return []
    return models


def main() -> None:
    ap = argparse.ArgumentParser(description="관악구 JMT 종량제 판매소 → StoreData 병합")
    ap.add_argument("--merge-into", type=Path, default=DEFAULT_MERGE)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--lat", type=float, default=37.478, help="검색 중심 위도 (관악구)")
    ap.add_argument("--lng", type=float, default=126.9515, help="검색 중심 경도")
    ap.add_argument("--radius", type=int, default=50, help="API radius (서버가 구 단위로 필터할 수 있음)")
    ap.add_argument("--minus-months", type=int, default=3, help="최근 거래월 (API)")
    ap.add_argument(
        "--include-all",
        action="store_true",
        help="종량제/PP마대/대형 스티커 거래가 없어도 좌표 있는 매장은 포함",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    try:
        raw = fetch_sellers(args.lat, args.lng, args.radius, args.minus_months)
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as e:
        print(f"API 실패: {e}", file=sys.stderr)
        raise SystemExit(1)
    except json.JSONDecodeError as e:
        print(f"JSON 파싱 실패: {e}", file=sys.stderr)
        raise SystemExit(1)

    print(f"API 매장 {len(raw)}건 (minusMonths={args.minus_months})", file=sys.stderr)

    by_key: dict[str, dict] = {}
    for m in raw:
        item = record_to_item(m)
        if item is None:
            continue
        ht, hs, hk = item["hasTrashBag"], item["hasSpecialBag"], item["hasLargeWasteSticker"]
        if not args.include_all and not (ht or hs or hk):
            continue
        if item.get("lat") is None or item.get("lng") is None:
            continue
        k0 = norm_key(item["name"], item["roadAddress"])
        if k0 not in by_key:
            by_key[k0] = item
        else:
            prev = by_key[k0]
            for fld in ("hasTrashBag", "hasSpecialBag", "hasLargeWasteSticker"):
                prev[fld] = bool(prev.get(fld)) or bool(item.get(fld))
            pr, ir = prev.get("dataReferenceDate"), item.get("dataReferenceDate")
            if ir and (not pr or ir > pr):
                prev["dataReferenceDate"] = ir

    built = list(by_key.values())
    print(f"중복 제거 후 {len(built)}건 (include_all={args.include_all})", file=sys.stderr)

    if args.dry_run:
        t = sum(1 for x in built if x["hasTrashBag"])
        sp = sum(1 for x in built if x["hasSpecialBag"])
        st = sum(1 for x in built if x["hasLargeWasteSticker"])
        sk = sum(1 for x in built if x.get("lat") is None or x.get("lng") is None)
        print(
            f"  종량제봉투류 {t}, PP마대(불연성) {sp}, 대형폐기물스티커 {st}, 좌표없음 {sk}",
            file=sys.stderr,
        )
        for x in built[:20]:
            fl = []
            if x["hasTrashBag"]:
                fl.append("종량제")
            if x["hasSpecialBag"]:
                fl.append("PP마대")
            if x["hasLargeWasteSticker"]:
                fl.append("대형")
            print(f"  [{'/'.join(fl) or '—'}] {x['name']} | {x['roadAddress']}")
        if len(built) > 20:
            print(f"  … 외 {len(built) - 20}건", file=sys.stderr)
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
