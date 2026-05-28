#!/usr/bin/env python3
"""
제주특별자치도 서귀포시 종량제봉투·불연성마대 판매소
→ stores.jeju-seogwipo-trash.json

출처: 생활폐기물 분리배출 누리집 종량제봉투 판매소 지도
  https://xn--oy2b29bd3a601b.kr/front/region/envplocation.do

  python3 scripts/import_jeju_seogwipo_trash_from_envp.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import date
from http.cookiejar import CookieJar
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.jeju-seogwipo-trash.json"
BASE_URL = "https://xn--oy2b29bd3a601b.kr"
ENVP_PAGE = "/front/region/envplocation.do"
REGION_LIST_URL = "/front/ajaxActNrRegionList.do"
PLACE_LIST_URL = "/front/ajaxActNrDischargePlaceList.do"

JEJU_CODE = "50"
SEOGWIPO_CODE = "50130"
NP_TYPE_TRASH_BAG = "115"
PREFIX = "jeju-seogwipo-trash"

WS_RE = re.compile(r"[ \t\r\n\v\f]+")
_CSRF_RE = re.compile(r'name="_csrf"\s+value="([^"]+)"')


def collapse(s: str) -> str:
    return WS_RE.sub(" ", (s or "").replace("\xa0", " ")).strip()


def parse_float(v: object) -> float | None:
    try:
        f = float(str(v).strip())
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def clean_envp_name(raw: object) -> str:
    if raw is None:
        return ""
    parts = [collapse(p) for p in str(raw).split(",")]
    kept = [p for p in parts if p and p != "재고수량"]
    return ", ".join(kept)


def has_envp_product(raw: object) -> bool:
    return bool(clean_envp_name(raw))


def seogwipo_in_text(blob: str) -> bool:
    t = (blob or "").replace(" ", "")
    return "서귀포" in t


def in_seogwipo_bbox(lat: float, lng: float) -> bool:
    # 성산·서쪽 해안·남쪽 도서 포함
    return 33.05 <= lat <= 33.55 and 126.15 <= lng <= 127.0


def format_road(addr: str, detail: str) -> str:
    road = collapse(addr)
    det = collapse(detail)
    if det and det not in road:
        return collapse(f"{road} {det}")
    return road


class EnvpClient:
    def __init__(self) -> None:
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.csrf = ""

    def _request(self, path: str, data: dict[str, str] | None = None) -> str:
        url = BASE_URL + path
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; vinyl-import/1.0)",
            "Referer": BASE_URL + ENVP_PAGE,
            "Origin": BASE_URL,
        }
        if data is None:
            req = urllib.request.Request(url, headers=headers)
            with self.opener.open(req, timeout=30) as resp:
                return resp.read().decode("utf-8", "replace")

        body = urllib.parse.urlencode(data).encode()
        headers.update(
            {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "X-Requested-With": "XMLHttpRequest",
            }
        )
        req = urllib.request.Request(url, data=body, method="POST", headers=headers)
        with self.opener.open(req, timeout=60) as resp:
            return resp.read().decode("utf-8", "replace")

    def bootstrap(self) -> None:
        html = self._request(ENVP_PAGE)
        m = _CSRF_RE.search(html)
        if not m:
            raise SystemExit("CSRF 토큰을 찾을 수 없습니다.")
        self.csrf = m.group(1)

    def post_json(self, path: str, data: dict[str, str]) -> dict:
        payload = {**data, "_csrf": self.csrf}
        return json.loads(self._request(path, payload))

    def fetch_seogwipo_places(self) -> list[dict]:
        data = self.post_json(
            PLACE_LIST_URL,
            {
                "searchOp1": JEJU_CODE,
                "searchOp2": SEOGWIPO_CODE,
                "searchOp4": NP_TYPE_TRASH_BAG,
                "searchOp5": "NrDischargePlace",
                "recordCountPerPage": "2000",
                "firstIndex": "0",
            },
        )
        rows = data.get("ajaxListResult") or []
        total = int(data.get("totalCnt2") or data.get("totalCnt") or len(rows))
        if len(rows) < total:
            merged: list[dict] = []
            page_size = 100
            for idx in range(0, total, page_size):
                chunk = self.post_json(
                    PLACE_LIST_URL,
                    {
                        "searchOp1": JEJU_CODE,
                        "searchOp2": SEOGWIPO_CODE,
                        "searchOp4": NP_TYPE_TRASH_BAG,
                        "searchOp5": "NrDischargePlace",
                        "actListMode": "PAGE",
                        "recordCountPerPage": str(page_size),
                        "firstIndex": str(idx),
                    },
                )
                merged.extend(chunk.get("ajaxListResult") or [])
            rows = merged
        return rows


def row_to_store(place: dict, ref_date: str) -> dict | None:
    name = collapse(place.get("strNm") or place.get("npNm") or "")
    road_raw = collapse(place.get("npAddr") or "")
    detail = collapse(place.get("npDetAddr") or "")
    road = format_road(road_raw, detail)
    if not name or not road:
        return None

    lat = parse_float(place.get("npLatitude"))
    lng = parse_float(place.get("npLongitude"))
    if lat is None or lng is None:
        return None

    blob = f"{name} {road} {place.get('npRegion2Nm', '')}"
    if not seogwipo_in_text(blob):
        return None
    if not in_seogwipo_bbox(lat, lng):
        return None

    has_trash = (
        has_envp_product(place.get("gnrlMrstEnvpNm"))
        or has_envp_product(place.get("ruseMrstEnvpNm"))
        or has_envp_product(place.get("foodMrstEnvpNm"))
    )
    has_special = has_envp_product(place.get("nflyMrstEnvpNm"))
    if not has_trash and not has_special:
        return None

    jibeon_parts = [
        collapse(place.get("npRegion1Nm") or ""),
        collapse(place.get("npRegion2Nm") or ""),
        collapse(place.get("npRegion3Nm1") or ""),
        collapse(place.get("npRegion3Nm2") or ""),
    ]
    jibeon = collapse(" ".join(p for p in jibeon_parts if p)) or road

    rid = hashlib.sha1(f"{name}\n{road}".encode()).hexdigest()[:20]
    return {
        "id": f"{PREFIX}-{rid}",
        "name": name,
        "lat": round(lat, 7),
        "lng": round(lng, 7),
        "roadAddress": road,
        "address": jibeon,
        "businessStatus": "영업",
        "hasTrashBag": has_trash,
        "hasSpecialBag": has_special,
        "hasLargeWasteSticker": False,
        "dataReferenceDate": ref_date,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref-date", default=date.today().isoformat())
    args = ap.parse_args()

    client = EnvpClient()
    client.bootstrap()
    raw_rows = client.fetch_seogwipo_places()

    out: list[dict] = []
    seen: set[str] = set()
    skipped = 0

    for place in raw_rows:
        store = row_to_store(place, args.ref_date)
        if store is None:
            skipped += 1
            continue
        dk = f"{store['name']}|{store['roadAddress']}"
        if dk in seen:
            continue
        seen.add(dk)
        out.append(store)

    out.sort(key=lambda x: (x["name"], x["roadAddress"]))
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"wrote {len(out)} → {OUT_JSON} (source={len(raw_rows)}, skipped={skipped}, ref_date={args.ref_date})",
        file=sys.stderr,
    )

    if out:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from append_activity import record_region_data_added

        record_region_data_added(["서귀포시"])


if __name__ == "__main__":
    main()
