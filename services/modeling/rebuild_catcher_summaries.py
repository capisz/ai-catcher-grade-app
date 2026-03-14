from __future__ import annotations

import argparse
from typing import Dict, List, Optional, Sequence

import pandas as pd

from catcher_intel.db import ensure_schema, execute_sql, read_dataframe, upsert_dataframe
from catcher_intel.grading import build_grade_outputs
from catcher_intel.summaries import build_summary_outputs

DEFAULT_MODEL_VERSION = "dva_v1_contextual"
SEASON_TABLES = [
    "catcher_season_summary",
    "catcher_count_summaries",
    "catcher_pitch_type_summaries",
    "catcher_pairing_summaries",
    "catcher_matchup_summaries",
    "catcher_grade_outputs",
    "dva_scoring_diagnostics",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Rebuild catcher scouting summary tables.")
    parser.add_argument("--db-url", required=True, help="Postgres SQLAlchemy URL")
    parser.add_argument(
        "--season",
        type=int,
        action="append",
        help="Optional season filter. Repeat the flag to rebuild multiple seasons.",
    )
    parser.add_argument("--model-version", default=DEFAULT_MODEL_VERSION)
    return parser.parse_args()


def resolve_seasons(database_url: str, seasons: Optional[Sequence[int]]) -> List[int]:
    if seasons:
        return sorted({int(season) for season in seasons})

    frame = read_dataframe(
        """
        SELECT DISTINCT COALESCE(game_year, EXTRACT(YEAR FROM game_date)::INT) AS season
        FROM catcher_pitch_scores
        WHERE catcher_id IS NOT NULL
        ORDER BY season
        """,
        database_url,
    )
    return [int(value) for value in frame["season"].dropna().tolist()]


def load_public_metrics(database_url: str, season: int) -> pd.DataFrame:
    metrics = read_dataframe(
        """
        SELECT *
        FROM catcher_public_metrics
        WHERE season = :season
        """,
        database_url,
        params={"season": season},
    )
    if not metrics.empty:
        return metrics

    return pd.DataFrame(
        columns=[
            "catcher_id",
            "season",
            "framing_runs",
            "blocking_runs",
            "arm_overall",
            "pop_time_2b",
        ]
    )


def clear_season_outputs(database_url: str, season: int) -> None:
    for table_name in SEASON_TABLES:
        execute_sql(
            f"DELETE FROM {table_name} WHERE season = :season",
            database_url,
            params={"season": season},
        )


def write_summary_frames(
    outputs: Dict[str, pd.DataFrame],
    grades: pd.DataFrame,
    database_url: str,
) -> Dict[str, int]:
    rows_written = {
        "season_summary": upsert_dataframe(
            outputs["season_summary"],
            "catcher_season_summary",
            ["catcher_id", "season"],
            database_url,
        )
        if not outputs["season_summary"].empty
        else 0,
        "count_summaries": upsert_dataframe(
            outputs["count_summaries"],
            "catcher_count_summaries",
            ["catcher_id", "season", "split_type", "split_value"],
            database_url,
        )
        if not outputs["count_summaries"].empty
        else 0,
        "pitch_type_summaries": upsert_dataframe(
            outputs["pitch_type_summaries"],
            "catcher_pitch_type_summaries",
            ["catcher_id", "season", "pitch_type"],
            database_url,
        )
        if not outputs["pitch_type_summaries"].empty
        else 0,
        "pairing_summaries": upsert_dataframe(
            outputs["pairing_summaries"],
            "catcher_pairing_summaries",
            ["catcher_id", "season", "pitcher_id"],
            database_url,
        )
        if not outputs["pairing_summaries"].empty
        else 0,
        "matchup_summaries": upsert_dataframe(
            outputs["matchup_summaries"],
            "catcher_matchup_summaries",
            ["catcher_id", "season", "stand", "p_throws"],
            database_url,
        )
        if not outputs["matchup_summaries"].empty
        else 0,
        "grade_outputs": upsert_dataframe(
            grades,
            "catcher_grade_outputs",
            ["catcher_id", "season"],
            database_url,
        )
        if not grades.empty
        else 0,
        "diagnostics": upsert_dataframe(
            outputs["diagnostics"],
            "dva_scoring_diagnostics",
            ["season", "model_version"],
            database_url,
        )
        if not outputs["diagnostics"].empty
        else 0,
    }
    return rows_written


def rebuild_season(database_url: str, season: int, model_version: str) -> None:
    clear_season_outputs(database_url, season)
    outputs = build_summary_outputs(database_url, season, model_version=model_version)
    if outputs["season_summary"].empty:
        print(f"Season {season}: no scored catcher summary rows found.")
        return

    public_metrics = load_public_metrics(database_url, season)
    grades = build_grade_outputs(outputs["season_summary"], public_metrics)
    rows_written = write_summary_frames(outputs, grades, database_url)
    print(
        f"Season {season}: summary={rows_written['season_summary']:,}, "
        f"counts={rows_written['count_summaries']:,}, "
        f"pitch_types={rows_written['pitch_type_summaries']:,}, "
        f"pairings={rows_written['pairing_summaries']:,}, "
        f"grades={rows_written['grade_outputs']:,}."
    )


def main() -> None:
    args = parse_args()
    ensure_schema(args.db_url)

    seasons = resolve_seasons(args.db_url, args.season)
    if not seasons:
        print("No seasons found in catcher_pitch_scores.")
        return

    for season in seasons:
        rebuild_season(args.db_url, season, model_version=args.model_version)


if __name__ == "__main__":
    main()
