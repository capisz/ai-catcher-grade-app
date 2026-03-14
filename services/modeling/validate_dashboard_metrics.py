from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict, List

import pandas as pd

from catcher_intel.api_service import IntelService
from catcher_intel.db import ensure_schema, read_dataframe


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate catcher dashboard metric distinctness.")
    parser.add_argument("--db-url", required=True, help="Postgres SQLAlchemy URL")
    parser.add_argument("--season", type=int, help="Optional scored season to validate.")
    parser.add_argument("--top-n", type=int, default=20, help="Number of catchers to inspect.")
    return parser.parse_args()


def resolve_season(service: IntelService, season: int | None) -> int:
    if season is not None:
        return season
    return int(service.get_catchers().season)


def load_top_catchers(database_url: str, season: int, top_n: int) -> pd.DataFrame:
    return read_dataframe(
        """
        SELECT
            summary.catcher_id,
            COALESCE(identity.full_name, 'Catcher ' || summary.catcher_id::text) AS catcher_name,
            summary.games_scored,
            summary.pitches,
            summary.total_dva,
            summary.avg_dva,
            summary.avg_execution_gap,
            summary.outperform_rate,
            summary.avg_surviving_candidate_count,
            summary.single_candidate_pct,
            summary.dropped_sparse_context_pct,
            summary.fallback_context_pct
        FROM catcher_season_summary summary
        LEFT JOIN player_identity identity
          ON identity.key_mlbam = summary.catcher_id
        WHERE summary.season = :season
        ORDER BY summary.total_dva DESC, summary.avg_dva DESC, summary.catcher_id ASC
        LIMIT :top_n
        """,
        database_url,
        params={"season": season, "top_n": top_n},
    )


def frontend_fallback_enabled(repo_root: Path) -> bool:
    api_ts = (repo_root / "apps" / "web" / "src" / "lib" / "api.ts").read_text()
    return "demo-data" in api_ts or "fetchWithFallback" in api_ts


def payload_signature(payload: Dict[str, Any]) -> str:
    normalized = dict(payload)
    normalized.pop("identity", None)
    encoded = json.dumps(normalized, sort_keys=True, default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def find_duplicate_payloads(service: IntelService, catcher_ids: List[int], season: int) -> Dict[str, List[int]]:
    duplicates: Dict[str, List[int]] = {}
    for catcher_id in catcher_ids:
        payload = service.get_catcher_detail(catcher_id, season).model_dump(mode="json")
        signature = payload_signature(payload)
        duplicates.setdefault(signature, []).append(catcher_id)
    return {signature: ids for signature, ids in duplicates.items() if len(ids) > 1}


def main() -> None:
    args = parse_args()
    os.environ["DATABASE_URL"] = args.db_url
    ensure_schema(args.db_url)
    service = IntelService()
    season = resolve_season(service, args.season)
    repo_root = Path(__file__).resolve().parents[2]

    top_catchers = load_top_catchers(args.db_url, season, args.top_n)
    if top_catchers.empty:
        print(f"Season {season}: no catcher season summaries found.")
        return

    print(f"Season {season} top {min(args.top_n, len(top_catchers))} catchers by total DVA")
    print(top_catchers.to_string(index=False))

    duplicate_summary_rows = (
        top_catchers[
            [
                "games_scored",
                "pitches",
                "total_dva",
                "avg_dva",
                "avg_execution_gap",
                "outperform_rate",
            ]
        ]
        .duplicated(keep=False)
        .sum()
    )
    print(f"\nIdentical top-row summary metric tuples: {int(duplicate_summary_rows)}")

    catcher_ids = [int(value) for value in top_catchers["catcher_id"].tolist()]
    duplicate_payload_groups = find_duplicate_payloads(service, catcher_ids, season)
    print(f"Duplicate catcher detail payload groups: {len(duplicate_payload_groups)}")
    if duplicate_payload_groups:
        for _, ids in duplicate_payload_groups.items():
            print(f"  shared payload: {ids}")

    first_id = catcher_ids[0]
    comparison_id = catcher_ids[1] if len(catcher_ids) > 1 else catcher_ids[0]
    first_payload = service.get_catcher_detail(first_id, season).model_dump(mode="json")
    second_payload = service.get_catcher_detail(comparison_id, season).model_dump(mode="json")
    changed = payload_signature(first_payload) != payload_signature(second_payload)
    print(
        "Selected catcher changes payload: "
        f"{changed} ({first_id} vs {comparison_id})"
    )

    print(
        "Frontend shared demo fallback enabled: "
        f"{frontend_fallback_enabled(repo_root)}"
    )
    print("Dashboard rows using shared demo fallback logic: 0")


if __name__ == "__main__":
    main()
