from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_SRC = REPO_ROOT / "packages" / "python" / "catcher_intel" / "src"
if str(PYTHON_SRC) not in sys.path:
    sys.path.insert(0, str(PYTHON_SRC))

from catcher_intel.api_service import IntelService
from catcher_intel.db import ensure_schema


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate catcher comparison payloads stay distinct under a shared filter context."
    )
    parser.add_argument("--db-url", required=True, help="Postgres SQLAlchemy URL")
    parser.add_argument("--season", type=int, help="Optional season to validate")
    parser.add_argument("--catcher-a", type=int, help="Optional catcher A MLBAM id")
    parser.add_argument("--catcher-b", type=int, help="Optional catcher B MLBAM id")
    parser.add_argument("--min-pitches", type=int, default=50, help="Shared minimum pitch filter")
    parser.add_argument("--date-from", type=date.fromisoformat, help="Optional YYYY-MM-DD lower bound")
    parser.add_argument("--date-to", type=date.fromisoformat, help="Optional YYYY-MM-DD upper bound")
    parser.add_argument("--team", help="Optional team abbreviation filter")
    argv = [value for value in sys.argv[1:] if value != "--"]
    return parser.parse_args(argv)


def payload_signature(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, default=str)


def resolve_catcher_ids(
    service: IntelService,
    season: int,
    min_pitches: int,
    team: str | None,
    date_from: date | None,
    date_to: date | None,
    catcher_a: int | None,
    catcher_b: int | None,
) -> tuple[int, int]:
    if catcher_a and catcher_b:
        if catcher_a == catcher_b:
            raise ValueError("Validation requires two distinct catcher ids.")
        return catcher_a, catcher_b

    leaderboard = service.get_leaderboard(
        min_pitches=max(1, min_pitches),
        season=season,
        date_from=date_from,
        date_to=date_to,
        team=team,
    )
    preferred_ids = [value for value in [catcher_a, catcher_b] if value is not None]
    distinct_ids: list[int] = []
    for catcher_id in preferred_ids + [entry.catcher_id for entry in leaderboard.leaderboard]:
        if catcher_id not in distinct_ids:
            distinct_ids.append(catcher_id)

    if len(distinct_ids) < 2:
        raise LookupError(
            f"Could not find two catchers to validate for season {season}"
            + (f" and team {team}" if team else "")
            + "."
        )

    return distinct_ids[0], distinct_ids[1]


def assert_condition(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def nearly_equal(left: float | None, right: float | None, tolerance: float = 1e-12) -> bool:
    if left is None or right is None:
        return left == right
    return abs(left - right) <= tolerance


def main() -> None:
    args = parse_args()
    os.environ["DATABASE_URL"] = args.db_url
    ensure_schema(args.db_url)
    service = IntelService()
    season = service.get_app_metadata(season=args.season).selected_season
    team = args.team.upper() if args.team else None
    catcher_a_id, catcher_b_id = resolve_catcher_ids(
        service=service,
        season=season,
        min_pitches=args.min_pitches,
        team=team,
        date_from=args.date_from,
        date_to=args.date_to,
        catcher_a=args.catcher_a,
        catcher_b=args.catcher_b,
    )

    comparison = service.get_catcher_comparison(
        catcher_a_id=catcher_a_id,
        catcher_b_id=catcher_b_id,
        season=season,
        min_pitches=args.min_pitches,
        date_from=args.date_from,
        date_to=args.date_to,
        team=team,
    )
    swapped = service.get_catcher_comparison(
        catcher_a_id=catcher_b_id,
        catcher_b_id=catcher_a_id,
        season=season,
        min_pitches=args.min_pitches,
        date_from=args.date_from,
        date_to=args.date_to,
        team=team,
    )

    catcher_a = comparison.catcher_a
    catcher_b = comparison.catcher_b
    catcher_a_payload = catcher_a.model_dump(mode="json")
    catcher_b_payload = catcher_b.model_dump(mode="json")

    assert_condition(
        catcher_a.identity.catcher_id != catcher_b.identity.catcher_id,
        "Comparison returned the same catcher identity on both sides.",
    )
    assert_condition(
        catcher_a.identity.catcher_id == catcher_a_id and catcher_b.identity.catcher_id == catcher_b_id,
        "Comparison catcher ids do not match the requested ids.",
    )
    assert_condition(
        comparison.filters.season == season
        and catcher_a.identity.season == season
        and catcher_b.identity.season == season,
        "Season filter was not applied equally to both catchers.",
    )
    assert_condition(
        comparison.filters.team == team,
        "Team filter echoed by the compare payload does not match the requested team filter.",
    )
    assert_condition(
        comparison.filters.date_from == args.date_from and comparison.filters.date_to == args.date_to,
        "Date range echoed by the compare payload does not match the requested date range.",
    )
    assert_condition(
        comparison.filters.min_pitches == args.min_pitches,
        "Shared minimum pitch filter did not round-trip through the compare payload.",
    )
    assert_condition(
        payload_signature(catcher_a_payload) != payload_signature(catcher_b_payload),
        "Comparison returned identical catcher payloads.",
    )

    meaningful_differences = [
        catcher_a.total_dva != catcher_b.total_dva,
        catcher_a.avg_dva != catcher_b.avg_dva,
        catcher_a.total_pitches != catcher_b.total_pitches,
        catcher_a.diagnostics.outperform_rate != catcher_b.diagnostics.outperform_rate,
        catcher_a.grades.overall_game_calling.score != catcher_b.grades.overall_game_calling.score,
    ]
    assert_condition(
        any(meaningful_differences),
        "Comparison did not surface any meaningful metric differences between the selected catchers.",
    )
    assert_condition(
        swapped.catcher_a.identity.catcher_id == catcher_b_id
        and swapped.catcher_b.identity.catcher_id == catcher_a_id,
        "Swapped comparison did not reverse the catcher identities.",
    )
    assert_condition(
        nearly_equal(swapped.catcher_a.total_dva, catcher_b.total_dva)
        and nearly_equal(swapped.catcher_b.total_dva, catcher_a.total_dva),
        "Swapped comparison did not preserve catcher-specific totals.",
    )

    print("Compare mode validation passed.")
    print(f"Season: {comparison.filters.season}")
    print(
        "Filters: "
        f"team={comparison.filters.team or 'ALL'} | "
        f"min_pitches={comparison.filters.min_pitches} | "
        f"date_from={comparison.filters.date_from or 'NONE'} | "
        f"date_to={comparison.filters.date_to or 'NONE'}"
    )
    print(
        f"Catcher A: {catcher_a.identity.catcher_name} ({catcher_a.identity.catcher_id}) | "
        f"total_dva={catcher_a.total_dva:.3f} | avg_dva={catcher_a.avg_dva:.5f} | "
        f"pitches={catcher_a.total_pitches}"
    )
    print(
        f"Catcher B: {catcher_b.identity.catcher_name} ({catcher_b.identity.catcher_id}) | "
        f"total_dva={catcher_b.total_dva:.3f} | avg_dva={catcher_b.avg_dva:.5f} | "
        f"pitches={catcher_b.total_pitches}"
    )
    print(
        f"Delta: total_dva={catcher_a.total_dva - catcher_b.total_dva:+.3f} | "
        f"avg_dva={catcher_a.avg_dva - catcher_b.avg_dva:+.5f} | "
        f"outperform_rate="
        f"{((catcher_a.diagnostics.outperform_rate or 0) - (catcher_b.diagnostics.outperform_rate or 0)):+.4f}"
    )


if __name__ == "__main__":
    main()
