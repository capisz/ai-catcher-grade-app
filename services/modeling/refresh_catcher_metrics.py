from __future__ import annotations

import argparse
from typing import List, Optional, Sequence

from catcher_intel.db import ensure_schema, execute_sql, read_dataframe, upsert_dataframe
from catcher_intel.public_data import fetch_catcher_public_metrics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Refresh public Baseball Savant catcher metrics by season."
    )
    parser.add_argument("--db-url", required=True, help="Postgres SQLAlchemy URL")
    parser.add_argument(
        "--season",
        type=int,
        action="append",
        help="Optional season filter. Repeat the flag to refresh multiple seasons.",
    )
    return parser.parse_args()


def resolve_seasons(database_url: str, seasons: Optional[Sequence[int]]) -> List[int]:
    if seasons:
        return sorted({int(season) for season in seasons})

    frame = read_dataframe(
        """
        SELECT DISTINCT game_year
        FROM pitches_raw
        WHERE game_year IS NOT NULL
        ORDER BY game_year
        """,
        database_url,
    )
    return [int(value) for value in frame["game_year"].dropna().tolist()]


def refresh_season(database_url: str, season: int) -> None:
    metrics = fetch_catcher_public_metrics(season)
    execute_sql(
        "DELETE FROM catcher_public_metrics WHERE season = :season",
        database_url,
        params={"season": season},
    )
    if metrics.empty:
        print(f"Season {season}: no public catcher metric rows returned.")
        return

    rows = upsert_dataframe(
        metrics,
        "catcher_public_metrics",
        ["catcher_id", "season"],
        database_url,
    )
    print(f"Season {season}: wrote {rows:,} public catcher metric rows.")


def main() -> None:
    args = parse_args()
    ensure_schema(args.db_url)

    seasons = resolve_seasons(args.db_url, args.season)
    if not seasons:
        print("No seasons found in pitches_raw.")
        return

    for season in seasons:
        refresh_season(args.db_url, season)


if __name__ == "__main__":
    main()
