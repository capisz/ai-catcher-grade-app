from __future__ import annotations

import argparse
from typing import List, Optional, Sequence

import pandas as pd

from catcher_intel.db import ensure_schema, execute_sql, read_dataframe, upsert_dataframe
from catcher_intel.public_data import build_player_metadata_frame, fetch_player_crosswalk


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Refresh MLB player metadata for catcher-intel.")
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


def prepare_crosswalk(metadata: pd.DataFrame) -> pd.DataFrame:
    if metadata.empty:
        return pd.DataFrame()

    player_ids = pd.to_numeric(metadata["player_id"], errors="coerce").dropna().astype(int).tolist()
    crosswalk = fetch_player_crosswalk(player_ids)
    if crosswalk.empty:
        return crosswalk

    crosswalk["player_id"] = pd.to_numeric(crosswalk["player_id"], errors="coerce").astype("Int64")
    return crosswalk.drop_duplicates(subset=["player_id"])


def refresh_season(database_url: str, season: int) -> None:
    metadata = build_player_metadata_frame(database_url, season)
    if metadata.empty:
        print(f"Season {season}: no player metadata rows returned.")
        return

    crosswalk = prepare_crosswalk(metadata)
    execute_sql(
        "DELETE FROM player_metadata WHERE season = :season",
        database_url,
        params={"season": season},
    )
    metadata_rows = upsert_dataframe(
        metadata,
        "player_metadata",
        ["player_id", "season"],
        database_url,
    )
    crosswalk_rows = 0
    if not crosswalk.empty:
        crosswalk_rows = upsert_dataframe(
            crosswalk,
            "player_id_crosswalk",
            ["player_id"],
            database_url,
        )

    selectable_count = int(metadata["is_selectable"].fillna(False).sum())
    print(
        f"Season {season}: wrote {metadata_rows:,} player rows, "
        f"{crosswalk_rows:,} crosswalk rows, {selectable_count:,} selectable catchers."
    )


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
