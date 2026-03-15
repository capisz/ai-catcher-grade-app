from __future__ import annotations

import io
import json
import re
import zipfile
from dataclasses import dataclass
from typing import Any

import pandas as pd

REPORT_SECTIONS_ORDER = [
    "identity",
    "overview",
    "grades",
    "summary_metrics",
    "count_state_breakdown",
    "count_bucket_breakdown",
    "pitch_type_breakdown",
    "pairing_breakdown",
    "platoon_matchup_breakdown",
    "diagnostics",
    "public_metrics",
    "metadata",
]

REPORT_SECTION_DEFINITIONS: dict[str, dict[str, Any]] = {
    "identity": {
        "label": "Player Identity",
        "description": "Catcher identity, team, handedness, and season context.",
        "default_selected": True,
    },
    "overview": {
        "label": "Overview Summary",
        "description": "High-level season value totals and per-pitch rates.",
        "default_selected": True,
    },
    "grades": {
        "label": "Grades",
        "description": "Transparent game-calling and support grades for the selected season.",
        "default_selected": True,
    },
    "summary_metrics": {
        "label": "Summary Metrics",
        "description": "Extended season metrics and model-derived support values.",
        "default_selected": True,
    },
    "count_state_breakdown": {
        "label": "Count-State Breakdown",
        "description": "Exact count-state DVA and execution summaries.",
        "default_selected": True,
    },
    "count_bucket_breakdown": {
        "label": "Count-Bucket Breakdown",
        "description": "Pitcher-ahead, even, hitter-ahead, and full-count splits.",
        "default_selected": True,
    },
    "pitch_type_breakdown": {
        "label": "Pitch-Type Breakdown",
        "description": "Pitch-type usage, DVA, and execution summaries.",
        "default_selected": True,
    },
    "pairing_breakdown": {
        "label": "Pitcher-Catcher Pairings",
        "description": "Battery pairings ranked by volume and value.",
        "default_selected": True,
    },
    "platoon_matchup_breakdown": {
        "label": "Platoon Matchups",
        "description": "Batter/pitcher handedness matchup summaries for the catcher.",
        "default_selected": False,
    },
    "diagnostics": {
        "label": "Diagnostics / Data Quality",
        "description": "Sample quality, sparse-context, and fallback diagnostics.",
        "default_selected": True,
    },
    "public_metrics": {
        "label": "Public Catcher Metrics",
        "description": "Public receiving, blocking, pop time, and arm support metrics.",
        "default_selected": True,
    },
    "metadata": {
        "label": "Metadata / Filters",
        "description": "Report filters, included sections, and public-data methodology notes.",
        "default_selected": True,
    },
}

REPORT_FORMAT_DEFINITIONS: dict[str, dict[str, Any]] = {
    "json": {
        "label": "JSON",
        "description": "Structured export with full nested catcher report data.",
        "available": True,
    },
    "csv": {
        "label": "CSV",
        "description": "Spreadsheet-friendly export. Multiple sections download as a zip of CSV files.",
        "available": True,
    },
    "pdf": {
        "label": "PDF",
        "description": "Presentation-friendly export. Coming soon.",
        "available": False,
    },
}


@dataclass
class GeneratedReport:
    content: bytes
    media_type: str
    filename: str


def normalize_report_sections(included_sections: list[str] | None) -> list[str]:
    requested = included_sections or []
    if not requested:
        requested = [
            key
            for key in REPORT_SECTIONS_ORDER
            if REPORT_SECTION_DEFINITIONS[key]["default_selected"]
        ]

    normalized: list[str] = []
    for section in requested:
        if section not in REPORT_SECTION_DEFINITIONS:
            raise ValueError(f"Unknown report section: {section}")
        if section not in normalized:
            normalized.append(section)
    return normalized


def build_report_filename_base(catcher_name: str, season: int) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", catcher_name.lower()).strip("-")
    slug = slug or "catcher"
    return f"catcher-report_{slug}_{season}"


def build_json_report(payload: dict[str, Any], filename_base: str) -> GeneratedReport:
    body = json.dumps(
        {
            "report_meta": payload["report_meta"],
            **payload["sections"],
        },
        indent=2,
        ensure_ascii=False,
    ).encode("utf-8")
    return GeneratedReport(
        content=body,
        media_type="application/json",
        filename=f"{filename_base}.json",
    )


def build_csv_report(
    payload: dict[str, Any],
    included_sections: list[str],
    filename_base: str,
) -> GeneratedReport:
    sections = payload["sections"]
    report_meta = payload["report_meta"]
    section_keys = [section for section in included_sections if section in sections]

    if len(section_keys) == 1:
        frame = _section_to_frame(
            section_keys[0],
            sections.get(section_keys[0]),
            report_meta,
            include_report_meta=True,
        )
        return GeneratedReport(
            content=frame.to_csv(index=False).encode("utf-8"),
            media_type="text/csv; charset=utf-8",
            filename=f"{filename_base}.csv",
        )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "report_meta.csv",
            _section_to_frame("report_meta", report_meta, report_meta, include_report_meta=False)
            .to_csv(index=False)
            .encode("utf-8"),
        )
        for key in section_keys:
            frame = _section_to_frame(
                key,
                sections.get(key),
                report_meta,
                include_report_meta=False,
            )
            archive.writestr(f"{key}.csv", frame.to_csv(index=False).encode("utf-8"))

    return GeneratedReport(
        content=buffer.getvalue(),
        media_type="application/zip",
        filename=f"{filename_base}.zip",
    )


def _section_to_frame(
    section_key: str,
    data: Any,
    report_meta: dict[str, Any],
    *,
    include_report_meta: bool,
) -> pd.DataFrame:
    records = _section_records(section_key, data)
    if not records:
        records = [
            {
                "section": section_key,
                "status": "no_data",
                "message": "No real data was available for this selected section.",
            }
        ]

    frame = pd.DataFrame(records)
    if include_report_meta:
        meta_columns = pd.DataFrame(
            [{**_flatten_report_meta(report_meta)} for _ in range(len(frame))]
        )
        frame = pd.concat([meta_columns.reset_index(drop=True), frame.reset_index(drop=True)], axis=1)
    return frame


def _section_records(section_key: str, data: Any) -> list[dict[str, Any]]:
    if data is None:
        return []
    if isinstance(data, list):
        return [dict(item) for item in data]
    if isinstance(data, dict):
        if section_key == "grades":
            return [
                {"grade_key": key, **value}
                for key, value in data.items()
            ]
        if section_key in {"metadata", "report_meta"}:
            return [{**_flatten_nested_dict(data)}]
        return [{**_flatten_nested_dict(data)}]
    return [{"value": data}]


def _flatten_report_meta(report_meta: dict[str, Any]) -> dict[str, Any]:
    filters = report_meta.get("filters", {})
    return {
        "report_catcher_id": report_meta.get("catcher_id"),
        "report_catcher_name": report_meta.get("catcher_name"),
        "report_team": report_meta.get("team"),
        "report_season": report_meta.get("season"),
        "report_generated_at": report_meta.get("generated_at"),
        "report_format": report_meta.get("format"),
        "report_sections": "|".join(report_meta.get("included_sections", [])),
        "filter_min_pitches": filters.get("min_pitches"),
        "filter_date_from": filters.get("date_from"),
        "filter_date_to": filters.get("date_to"),
    }


def _flatten_nested_dict(
    value: dict[str, Any],
    prefix: str = "",
) -> dict[str, Any]:
    flattened: dict[str, Any] = {}
    for key, item in value.items():
        next_key = f"{prefix}_{key}" if prefix else key
        if isinstance(item, dict):
            flattened.update(_flatten_nested_dict(item, next_key))
        elif isinstance(item, list):
            flattened[next_key] = json.dumps(item)
        else:
            flattened[next_key] = item
    return flattened
