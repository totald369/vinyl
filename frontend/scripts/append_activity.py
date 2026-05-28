#!/usr/bin/env python3
"""
Activity Feed 자동 기록 (Python import 스크립트용).

  from append_activity import record_region_data_added
  record_region_data_added(["화순군"])
  record_region_data_added(["부안군", "정읍시", "여수시", "순천시", "화순군"])
"""

from __future__ import annotations

import json
import random
import string
from datetime import date
from pathlib import Path
from typing import Iterable

FRONTEND = Path(__file__).resolve().parent.parent
ACTIVITIES_PATH = FRONTEND / "public" / "data" / "activities.json"
MAX_STORED = 200


def _today() -> str:
    return date.today().isoformat()


def _unique_regions(regions: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for region in regions:
        trimmed = (region or "").strip()
        if not trimmed or trimmed in seen:
            continue
        seen.add(trimmed)
        out.append(trimmed)
    return out


def _read_activities() -> list[dict]:
    if not ACTIVITIES_PATH.exists():
        return []
    try:
        raw = json.loads(ACTIVITIES_PATH.read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except json.JSONDecodeError:
        return []


def _write_activities(items: list[dict]) -> None:
    ACTIVITIES_PATH.parent.mkdir(parents=True, exist_ok=True)
    ACTIVITIES_PATH.write_text(
        json.dumps(items[:MAX_STORED], ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _prepend(item: dict) -> dict:
    existing = _read_activities()
    _write_activities([item, *existing])
    return item


def _new_id(activity_type: str, created_at: str) -> str:
    slug = activity_type.lower().replace("_", "-")
    suffix = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(6))
    return f"act-{created_at}-{slug}-{suffix}"


def record_region_data_added(regions: Iterable[str], created_at: str | None = None) -> dict | None:
    unique_new = _unique_regions(regions)
    if not unique_new:
        return None
    created = (created_at or _today())[:10]
    existing = _read_activities()

    for i, item in enumerate(existing):
        if item.get("type") != "REGION_DATA_ADDED":
            continue
        if str(item.get("createdAt", ""))[:10] != created:
            continue
        merged_regions = _unique_regions([*(item.get("affectedRegions") or []), *unique_new])
        updated = {**item, "affectedRegions": merged_regions}
        rest = [row for j, row in enumerate(existing) if j != i]
        _write_activities([updated, *rest])
        print(f"[activity] REGION_DATA_ADDED merged ({', '.join(merged_regions)})")
        return updated

    item = {
        "id": _new_id("REGION_DATA_ADDED", created),
        "type": "REGION_DATA_ADDED",
        "createdAt": created,
        "affectedRegions": unique_new,
    }
    _prepend(item)
    print(f"[activity] REGION_DATA_ADDED ({', '.join(unique_new)})")
    return item


def record_store_info_updated(
    regions: Iterable[str],
    affected_count: int | None = None,
    created_at: str | None = None,
) -> dict | None:
    unique = _unique_regions(regions)
    if not unique:
        return None
    created = (created_at or _today())[:10]
    item = {
        "id": _new_id("STORE_INFO_UPDATED", created),
        "type": "STORE_INFO_UPDATED",
        "createdAt": created,
        "affectedRegions": unique,
        "affectedCount": affected_count if affected_count is not None else len(unique),
    }
    _prepend(item)
    print(f"[activity] STORE_INFO_UPDATED ({', '.join(unique)})")
    return item


def record_user_reports_reflected(count: int, created_at: str | None = None) -> dict | None:
    if count <= 0:
        return None
    created = (created_at or _today())[:10]
    item = {
        "id": _new_id("USER_REPORT_REFLECTED", created),
        "type": "USER_REPORT_REFLECTED",
        "createdAt": created,
        "count": count,
    }
    _prepend(item)
    print(f"[activity] USER_REPORT_REFLECTED × {count}")
    return item
