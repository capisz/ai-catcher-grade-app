from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from catcher_intel.db import ensure_schema, read_dataframe


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Refresh the latest available season and rebuild scored catcher summaries."
    )
    parser.add_argument("--db-url", required=True, help="Postgres SQLAlchemy URL")
    parser.add_argument(
        "--season",
        type=int,
        help="Optional season override. Defaults to the latest season in pitches_raw.",
    )
    parser.add_argument("--model-version", default="dva_v1_contextual")
    parser.add_argument(
        "--python-bin",
        default=sys.executable,
        help="Python interpreter used to run the refresh pipeline.",
    )
    return parser.parse_args()


def resolve_season(database_url: str, season: int | None) -> int | None:
    if season is not None:
        return int(season)

    frame = read_dataframe(
        """
        SELECT MAX(game_year) AS season
        FROM pitches_raw
        WHERE game_year IS NOT NULL
        """,
        database_url,
    )
    if frame.empty or frame.iloc[0]["season"] is None:
        return None
    return int(frame.iloc[0]["season"])


def run_step(python_bin: str, script_path: Path, args: list[str]) -> None:
    command = [python_bin, str(script_path), *args]
    print("Running:", " ".join(command))
    subprocess.run(command, check=True)


def main() -> None:
    args = parse_args()
    ensure_schema(args.db_url)

    season = resolve_season(args.db_url, args.season)
    if season is None:
        print("No seasons found in pitches_raw. Ingest data before running the refresh pipeline.")
        return

    root = Path(__file__).resolve().parents[2]
    steps = [
        ("refresh player metadata", root / "services" / "modeling" / "refresh_player_metadata.py", [
            "--db-url",
            args.db_url,
            "--season",
            str(season),
        ]),
        ("refresh catcher metrics", root / "services" / "modeling" / "refresh_catcher_metrics.py", [
            "--db-url",
            args.db_url,
            "--season",
            str(season),
        ]),
        ("score dva", root / "services" / "modeling" / "score_dva.py", [
            "--db-url",
            args.db_url,
            "--season",
            str(season),
            "--model-version",
            args.model_version,
        ]),
        ("rebuild summaries", root / "services" / "modeling" / "rebuild_catcher_summaries.py", [
            "--db-url",
            args.db_url,
            "--season",
            str(season),
            "--model-version",
            args.model_version,
        ]),
    ]

    print(f"Refreshing latest scored season: {season}")
    for label, script_path, step_args in steps:
        print(f"\n== {label} ==")
        run_step(args.python_bin, script_path, step_args)

    print(f"\nFinished refreshing season {season}.")


if __name__ == "__main__":
    main()
