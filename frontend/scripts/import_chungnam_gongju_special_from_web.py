#!/usr/bin/env python3
"""
공주시청 특수규격봉투(불연성마대) 판매 소매점
  https://www.gongju.go.kr/kr/sub06_08_06_08.do → stores.chungnam-gongju-special.json

표(연번·소재지·상호명·주소·연락처) 파싱 + 카카오 지오코딩.

  python3 scripts/import_chungnam_gongju_special_from_web.py [--url …]

KAKAO_REST_API_KEY: frontend/.env.local
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

FRONTEND = Path(__file__).resolve().parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent
OUT_JSON = FRONTEND / "public" / "data" / "stores.chungnam-gongju-special.json"
CACHE_PATH = SCRIPT_DIR / "geocode-cache-chungnam-gongju-special.json"

SOURCE_URL = "https://www.gongju.go.kr/kr/sub06_08_06_08.do"

GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
GEOCODE_DELAY = 0.07

WS_RE = re.compile(r"[ \t\r\n\v\f]+")
_ROW_RX = re.compile(
    r'<th\s+scope="row">\s*(\d+)\s*</th>\s*'
    r"<td[^>]*>([^<]*)</td>\s*"
    r"<td[^>]*>([^<]*)</td>\s*"
    r"<td[^>]*>([^<]*)</td>\s*"
    r"<td[^>]*>([^<]*)</td>",
    re.I | re.S,
)
_REF_RX = re.compile(r"\((\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*기준\)")


def _load_dotenv_local() -> None:
    p = FRONTEND / ".env.local"
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


_load_dotenv_local()


def load_kakao_key() -> str | None:
    return (
        os.environ.get("KAKAO_REST_API_KEY", "").strip()
        or os.environ.get("KAKAO_REST_KEY", "").strip()
    )


def collapse(s: str) -> str:
    return WS_RE.sub(" ", (s or "").replace("\xa0", " ")).strip()


def parse_float(v: object) -> float | None:
    try:
        f = float(str(v).strip())
        return f if f == f else None
    except (TypeError, ValueError):
        return None


def normalize_road(addr: str) -> str:
    """충남 공주시 → 충청남도 공주시 로 통일(지도 데이터와 동일 접두)."""
    a = collapse(addr)
    if a.startswith("충남 "):
        a = "충청남도 " + a[3:].lstrip()
    elif a.startswith("충남공주시"):
        a = "충청남도 공주시" + a[len("충남공주시") :]
    return collapse(a)


def in_gongju_area_bbox(lat: float, lng: float) -> bool:
    return 36.20 <= lat <= 36.90 and 126.80 <= lng <= 127.40


def is_gongju_addr_blob(s: str) -> bool:
    return "공주시" in s or ("공주" in s and ("충남" in s or "충청남도" in s))


def addr_region_ok(blob: str) -> bool:
    if "충청남도" not in blob and "충남" not in blob:
        return False
    return is_gongju_addr_blob(blob)


def _doc_addr_blob(d: dict) -> str:
    parts: list[str] = []

    def touch(v: object) -> None:
        if isinstance(v, str) and v.strip():
            parts.append(v.strip())
        elif isinstance(v, dict):
            for sk in ("address_name", "region_1depth_name", "region_2depth_name"):
                s = v.get(sk)
                if isinstance(s, str) and s.strip():
                    parts.append(s.strip())

    touch(d.get("address_name"))
    touch(d.get("address"))
    touch(d.get("road_address"))
    return " ".join(parts)


def load_cache() -> dict[str, list[float]]:
    if not CACHE_PATH.is_file():
        return {}
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def save_cache(c: dict[str, list[float]]) -> None:
    CACHE_PATH.write_text(json.dumps(c, ensure_ascii=False, indent=2), encoding="utf-8")


def fetch_html(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; TrashBagMap-GongJuImport/1.0)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_ref_date(html: str) -> str:
    m = _REF_RX.search(html)
    if not m:
        return "2025-04-03"
    y, mo, da = m.groups()
    return f"{int(y):04d}-{int(mo):02d}-{int(da):02d}"


def parse_table_rows(html: str) -> list[tuple[int, str, str, str, str]]:
    m = re.search(r"<tbody[^>]*>(.*?)</tbody>", html, re.I | re.S)
    if not m:
        raise SystemExit("tbody 없음 — 페이지 구조 변경 가능")
    body = m.group(1)
    rows: list[tuple[int, str, str, str, str]] = []
    for seq_s, dong, name, addr, phone in _ROW_RX.findall(body):
        seq = int(seq_s)
        rows.append(
            (
                seq,
                collapse(dong),
                collapse(name),
                collapse(addr),
                collapse(phone),
            )
        )
    if not rows:
        raise SystemExit("판매처 행을 찾지 못했습니다.")
    return rows


def kakao_address(query: str, key: str) -> tuple[float | None, float | None]:
    q = collapse(query)
    if not q:
        return None, None
    req = urllib.request.Request(
        f"{GEOCODE_URL}?{urllib.parse.urlencode({'query': q})}",
        headers={"Authorization": f"KakaoAK {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None, None
    for d in data.get("documents") or []:
        lat = parse_float(d.get("y"))
        lng = parse_float(d.get("x"))
        if lat is None or lng is None:
            continue
        if not in_gongju_area_bbox(lat, lng):
            continue
        if not addr_region_ok(_doc_addr_blob(d)):
            continue
        return lat, lng
    return None, None


def kakao_keyword(query: str, key: str) -> tuple[float | None, float | None]:
    q = collapse(query)
    if not q:
        return None, None
    req = urllib.request.Request(
        f"{KEYWORD_URL}?{urllib.parse.urlencode({'query': q, 'size': '15'})}",
        headers={"Authorization": f"KakaoAK {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None, None
    for d in data.get("documents") or []:
        lat = parse_float(d.get("y"))
        lng = parse_float(d.get("x"))
        if lat is None or lng is None:
            continue
        if not in_gongju_area_bbox(lat, lng):
            continue
        road = collapse(str(d.get("road_address_name") or ""))
        jibeon = collapse(str(d.get("address_name") or ""))
        blob = f"{road} {jibeon}"
        if not addr_region_ok(blob):
            continue
        return lat, lng
    return None, None


def geocode_variants(road_norm: str, name: str, dong: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []

    def push(s: str) -> None:
        t = collapse(s)
        if t and t not in seen:
            seen.add(t)
            out.append(t)

    push(road_norm)
    push(re.sub(r"\s*\([^)]*\)\s*", " ", road_norm))
    dn = dong.replace("면", "").replace("읍", "").replace("동", "")
    push(f"{name} {dong}")
    push(f"{name} 공주시")
    push(f"{name} 공주시 {dn}")
    return out


def resolve_coord(
    road_norm: str,
    name: str,
    dong: str,
    seq: int,
    cache: dict[str, list[float]],
    key: str,
) -> tuple[float | None, float | None]:
    ck = "s:" + hashlib.sha1(f"{seq}:{name}:{road_norm}".encode()).hexdigest()[:32]
    hit = cache.get(ck)
    if hit and len(hit) == 2:
        return float(hit[0]), float(hit[1])
    for q in geocode_variants(road_norm, name, dong):
        la, ln = kakao_address(q, key)
        if la is None:
            la, ln = kakao_keyword(q, key)
        if la is not None:
            cache[ck] = [float(la), float(ln)]
            return la, ln
    return None, None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=SOURCE_URL)
    args = ap.parse_args()

    key = load_kakao_key()
    if not key:
        print("오류: KAKAO_REST_API_KEY 가 없습니다.", file=sys.stderr)
        raise SystemExit(1)

    html = fetch_html(args.url)
    ref_date = parse_ref_date(html)
    raw_rows = parse_table_rows(html)

    cache = load_cache()
    out: list[dict] = []
    geo_n = 0
    misses = 0

    for seq, dong, name, addr, phone in raw_rows:
        if not name or not addr:
            continue
        road_norm = normalize_road(addr)
        lat, lng = resolve_coord(road_norm, name, dong, seq, cache, key)
        if lat is None:
            misses += 1
            print(f"[geocode 실패] {name}\t{road_norm}", file=sys.stderr)
            continue
        geo_n += 1
        if geo_n % 30 == 0:
            save_cache(cache)
            print(f"[geocode] {geo_n} …", file=sys.stderr)
        time.sleep(GEOCODE_DELAY)

        rid = (
            "chungnam-gongju-special-"
            + hashlib.sha1(f"{seq}\n{name}\n{road_norm}".encode()).hexdigest()[:20]
        )
        rec: dict = {
            "id": rid,
            "name": name,
            "lat": round(float(lat), 7),
            "lng": round(float(lng), 7),
            "roadAddress": road_norm,
            "address": collapse(f"충청남도 공주시 {dong}") if dong else "충청남도 공주시",
            "businessStatus": "영업",
            "hasTrashBag": False,
            "hasSpecialBag": True,
            "hasLargeWasteSticker": False,
            "adminVerified": True,
            "dataReferenceDate": ref_date,
        }
        if phone:
            rec["phone"] = phone
        out.append(rec)

    save_cache(cache)
    out.sort(key=lambda x: (x["name"], x["roadAddress"]))
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(
        f"wrote {len(out)} → {OUT_JSON} "
        f"(ref_date={ref_date}, source={args.url}, api≈{geo_n}, miss={misses})"
    )


if __name__ == "__main__":
    main()
