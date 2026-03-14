from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta
from typing import Iterable

import pandas as pd
from pybaseball import statcast
from sqlalchemy import text

from catcher_intel.candidate_sets import build_candidate_pitch_sets
from catcher_intel.config import get_settings
from catcher_intel.db import clear_table, ensure_schema, get_engine, read_dataframe, write_dataframe
from catcher_intel.feature_engineering import RAW_OUTPUT_COLUMNS, derive_feature_frame, normalize_statcast_frame


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pull Statcast data and upsert normalized pitches.")
    parser.add_argument("--start-date", required=True, help="Inclusive start date in YYYY-MM-DD format.")
    parser.add_argument("--end-date", required=True, help="Inclusive end date in YYYY-MM-DD format.")
    parser.add_argument(
        "--db-url",
        "--database-url",
        dest="database_url",
        default=None,
        help="SQLAlchemy connection string. Defaults to DATABASE_URL or sqlite:///data/local.db.",
    )
    parser.add_argument("--chunk-days", type=int, default=7, help="Chunk size for Statcast pulls.")
    return parser.parse_args()


def daterange_chunks(start_dt: date, end_dt: date, chunk_days: int = 7) -> Iterable[tuple[date, date]]:
    current = start_dt
    while current <= end_dt:
        chunk_end = min(current + timedelta(days=chunk_days - 1), end_dt)
        yield current, chunk_end
        current = chunk_end + timedelta(days=1)


def upsert_dataframe(df: pd.DataFrame, db_url: str, table_name: str = "pitches_raw") -> None:
    if df.empty:
        return

    engine = get_engine(db_url)
    temp_table = f"{table_name}_staging"
    columns_csv = ", ".join(RAW_OUTPUT_COLUMNS)
    update_clause = ", ".join(
        f"{column} = EXCLUDED.{column}" for column in RAW_OUTPUT_COLUMNS if column != "pitch_uid"
    )

    with engine.begin() as connection:
        df.to_sql(temp_table, connection, if_exists="replace", index=False)

        if engine.dialect.name == "postgresql":
            connection.execute(
                text(
                    f"""
                    INSERT INTO {table_name} ({columns_csv})
                    SELECT {columns_csv}
                    FROM {temp_table}
                    ON CONFLICT (pitch_uid) DO UPDATE SET
                        {update_clause}
                    """
                )
            )
        else:
            connection.execute(
                text(
                    f"""
                    INSERT OR REPLACE INTO {table_name} ({columns_csv})
                    SELECT {columns_csv}
                    FROM {temp_table}
                    """
                )
            )

        connection.execute(text(f"DROP TABLE IF EXISTS {temp_table}"))


def rebuild_feature_tables(db_url: str) -> None:
    raw_frame = read_dataframe(
        "SELECT * FROM pitches_raw ORDER BY game_date, game_pk, at_bat_number, pitch_number",
        db_url,
    )
    if raw_frame.empty:
        return

    feature_frame = derive_feature_frame(raw_frame)
    candidate_frame = build_candidate_pitch_sets(raw_frame, feature_frame)

    for table_name in [
        "pitch_features",
        "pitcher_candidate_pitch_sets",
        "catcher_pitch_scores",
        "catcher_game_scores",
        "batter_zone_profiles",
        "model_registry",
    ]:
        clear_table(db_url, table_name)

    write_dataframe(feature_frame, "pitch_features", db_url)
    write_dataframe(candidate_frame, "pitcher_candidate_pitch_sets", db_url)


def ingest_range(start_date: str, end_date: str, db_url: str, chunk_days: int = 7) -> int:
    start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()

    rows_written = 0
    for chunk_start, chunk_end in daterange_chunks(start_dt, end_dt, chunk_days=chunk_days):
        print(f"Pulling {chunk_start} -> {chunk_end}")
        chunk_frame = statcast(start_dt=str(chunk_start), end_dt=str(chunk_end))
        if chunk_frame is None or chunk_frame.empty:
            print("  no rows")
            continue

        normalized = normalize_statcast_frame(chunk_frame)
        upsert_dataframe(normalized, db_url=db_url)
        rows_written += len(normalized)
        print(f"  wrote {len(normalized):,} rows")

    rebuild_feature_tables(db_url)
    return rows_written


def main() -> None:
    args = parse_args()
    settings = get_settings(args.database_url)
    ensure_schema(settings.database_url)

    rows_written = ingest_range(
        start_date=args.start_date,
        end_date=args.end_date,
        db_url=settings.database_url,
        chunk_days=args.chunk_days,
    )
    print(
        f"Ingested or updated {rows_written:,} pitches from {args.start_date} to {args.end_date} into "
        f"{settings.database_url}."
    )


if __name__ == "__main__":
    main()
