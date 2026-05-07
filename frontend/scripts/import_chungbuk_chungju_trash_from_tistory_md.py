#!/usr/bin/env python3
"""
충주시 종량제봉투 판매소 — 티스토리 게시글 표(마크다운) 파싱 → stores.chungbuk-chungju-trash.json

원본: https://dataviewtech.tistory.com/208
표 원본 파일: scripts/data/chungbuk-chungju-trash-tistory-208.md (게시글의 표를 복사해 둠)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
FRONTEND = SCRIPT_DIR.parent
DEFAULT_MD = SCRIPT_DIR / "data" / "chungbuk-chungju-trash-tistory-208.md"
OUT_JSON = FRONTEND / "public" / "data" / "stores.chungbuk-chungju-trash.json"
CACHE_PATH = SCRIPT_DIR / "geocode-cache-chungbuk-chungju-trash.json"

SHORT_CODE_RE = re.compile(r"^[a-zA-Z0-9]{6}$")
DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})$")
GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"
KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"


def load_kakao_key() -> str | None:
    k = os.environ.get("KAKAO_REST_API_KEY", "").strip()
    if k:
        return k
    p = FRONTEND / ".env.local"
    if not p.exists():
        return None
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("KAKAO_REST_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'") or None
    return None


def collapse(s: str) -> str:
    return " ".join((s or "").replace("\xa0", " ").split())


def fix_address_typos(raw: str) -> str:
    a = collapse(raw)
    a = a.replace("충정북도", "충청북도")
    a = re.sub(r"충주시([가-힣])", r"충주시 \1", a)
    a = re.sub(r"(\d+길)(\d+)$", r"\1 \2", a)
    a = re.sub(r"(\d+번길)(\d+)", r"\1 \2", a)
    for noise in (" 팩스전송", " 태경", " 단지아파트", " 단지내"):
        if noise in a:
            a = a.replace(noise, "").strip()
    return collapse(a)


def normalize_addr(addr: str) -> str:
    a = fix_address_typos(addr)
    if not a:
        return a
    if a.startswith("충청북도 충주시"):
        return a
    if a.startswith("충주시"):
        return "충청북도 " + a
    return f"충청북도 충주시 {a}"


def addr_variants(addr: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()

    def add(v: str) -> None:
        t = collapse(v)
        if t and t not in seen:
            seen.add(t)
            out.append(t)

    add(addr)
    head = re.sub(r"\(.*?\)", "", addr).strip()
    add(collapse(head))
    add(collapse(re.sub(r"(\d+길)(\d+)$", r"\1 \2", head)))
    add(collapse(re.sub(r"(\d+번길)(\d+)$", r"\1 \2", head)))
    add(collapse(re.sub(r"([가-힣]+로)(\d)", r"\1 \2", head)))
    return out


def parse_md_row(line: str) -> tuple[str, str, str] | None:
    s = line.strip()
    if not s.startswith("|"):
        return None
    parts = [p.strip() for p in s.strip().strip("|").split("|")]
    if len(parts) < 3:
        return None
    name, addr, ref = parts[0], parts[1], parts[2]
    if not name or name == "판매소명":
        return None
    if name.startswith("--") or addr.startswith("--"):
        return None
    if not DATE_RE.match(ref):
        return None
    return name, addr, ref


def parse_float(v: str | None) -> float | None:
    try:
        return float((v or "").strip())
    except ValueError:
        return None


def kakao_geocode(q: str, key: str) -> tuple[float | None, float | None]:
    for base, extra in (
        (GEOCODE_URL, {"query": q}),
        (KEYWORD_URL, {"query": q, "size": "1"}),
    ):
        req = urllib.request.Request(
            f"{base}?{urllib.parse.urlencode(extra)}",
            headers={"Authorization": f"KakaoAK {key}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception:
            continue
        docs = data.get("documents") or []
        if not docs:
            continue
        lat = parse_float(docs[0].get("y"))
        lng = parse_float(docs[0].get("x"))
        if lat and lng:
            return lat, lng
    return None, None


def load_cache() -> dict[str, list[float]]:
    if not CACHE_PATH.exists():
        return {}
    try:
        raw = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    out: dict[str, list[float]] = {}
    if isinstance(raw, dict):
        for k, v in raw.items():
            if isinstance(v, list) and len(v) == 2:
                out[str(k)] = [float(v[0]), float(v[1])]
    return out


def save_cache(cache: dict[str, list[float]]) -> None:
    CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8")


def load_existing_meta(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    out: dict[str, dict[str, str]] = {}
    if not isinstance(rows, list):
        return out
    for row in rows:
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


def in_chungju_bbox(lat: float, lng: float) -> bool:
    return 36.82 <= lat <= 37.15 and 127.72 <= lng <= 128.10


def read_source_rows(md_path: Path) -> list[dict[str, str]]:
    text = md_path.read_text(encoding="utf-8")
    out: list[dict[str, str]] = []
    for line in text.splitlines():
        pr = parse_md_row(line)
        if not pr:
            continue
        name_s, addr_raw, ref_d = pr
        road = normalize_addr(addr_raw)
        if not collapse(name_s) or not road:
            continue
        out.append(
            {
                "name": collapse(name_s),
                "roadAddress": road,
                "dataReferenceDate": ref_d,
            }
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--md", type=Path, default=DEFAULT_MD, help="티스토리 표 마크다운 파일")
    args = ap.parse_args()
    md_path: Path = args.md

    if not md_path.exists():
        raise SystemExit(f"md 없음: {md_path}")
    key = load_kakao_key()
    if not key:
        raise SystemExit("KAKAO_REST_API_KEY 필요")

    raw_rows = read_source_rows(md_path)
    dedup: dict[str, dict] = {}
    for r in raw_rows:
        k = f"{r['name'].lower()}|{r['roadAddress'].lower()}|{r['dataReferenceDate']}"
        if k not in dedup:
            dedup[k] = r

    rows = sorted(
        dedup.values(),
        key=lambda x: (x["name"], x["roadAddress"], x["dataReferenceDate"]),
    )
    cache = load_cache()
    existing_meta = load_existing_meta(OUT_JSON)
    today = date.today().isoformat()

    out: list[dict] = []
    for i, r in enumerate(rows, start=1):
        sid = f"chungbuk-chungju-trash-{i:04d}"
        ck = hashlib.sha1(
            (r["name"] + "\t" + r["roadAddress"]).encode("utf-8")
        ).hexdigest()[:20]
        ref_row = r["dataReferenceDate"]

        if ck in cache:
            lat, lng = cache[ck]
        else:
            lat = lng = None
            for base in addr_variants(r["roadAddress"]):
                for q in (
                    base,
                    f"{r['name']} {base}",
                    f"충주시 {r['name']}",
                    f"충북 충주 {r['name']}",
                ):
                    glat, glng = kakao_geocode(q, key)
                    if glat is not None and glng is not None:
                        lat, lng = glat, glng
                        break
                if lat is not None and lng is not None:
                    break
            if lat is None or lng is None:
                continue
            if not in_chungju_bbox(lat, lng):
                continue
            cache[ck] = [lat, lng]
            if i % 40 == 0:
                save_cache(cache)
            time.sleep(0.08)

        if not in_chungju_bbox(float(lat), float(lng)):  # type: ignore[arg-type]
            continue

        rec = {
            "id": sid,
            "name": r["name"],
            "lat": round(float(lat), 7),
            "lng": round(float(lng), 7),
            "roadAddress": r["roadAddress"],
            "address": "충청북도 충주시",
            "businessStatus": "영업",
            "hasTrashBag": True,
            "hasSpecialBag": False,
            "hasLargeWasteSticker": False,
            "adminVerified": True,
            "dataReferenceDate": existing_meta.get(sid, {}).get(
                "dataReferenceDate", ref_row or today
            ),
        }
        sc = existing_meta.get(sid, {}).get("shortCode")
        if sc:
            rec["shortCode"] = sc
        out.append(rec)

    save_cache(cache)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(out)} rows (from {len(rows)} parsed) -> {OUT_JSON}")


if __name__ == "__main__":
    main()
