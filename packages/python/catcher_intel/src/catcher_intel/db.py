from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional, Sequence

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

SCHEMA_MIGRATIONS = [
    "ALTER TABLE catcher_pitch_scores ADD COLUMN IF NOT EXISTS pitcher_id BIGINT",
    "ALTER TABLE catcher_pitch_scores ADD COLUMN IF NOT EXISTS batter_id BIGINT",
    "ALTER TABLE catcher_pitch_scores ADD COLUMN IF NOT EXISTS game_year INT",
    "ALTER TABLE catcher_pitch_scores ADD COLUMN IF NOT EXISTS actual_context_sample_size INT",
    "ALTER TABLE catcher_pitch_scores ADD COLUMN IF NOT EXISTS surviving_candidate_count INT",
    "ALTER TABLE catcher_pitch_scores ADD COLUMN IF NOT EXISTS fallback_tier TEXT",
    "ALTER TABLE catcher_pitch_scores ADD COLUMN IF NOT EXISTS outperformed_baseline BOOLEAN",
    "ALTER TABLE catcher_game_scores ADD COLUMN IF NOT EXISTS game_year INT",
    "ALTER TABLE catcher_season_summary ADD COLUMN IF NOT EXISTS games_scored INT DEFAULT 0",
    "ALTER TABLE catcher_season_summary ADD COLUMN IF NOT EXISTS fallback_context_pct DOUBLE PRECISION",
    "ALTER TABLE catcher_grade_outputs ALTER COLUMN overall_game_calling_score DROP NOT NULL",
    "ALTER TABLE catcher_grade_outputs ALTER COLUMN overall_game_calling_label DROP NOT NULL",
    "ALTER TABLE catcher_grade_outputs ALTER COLUMN count_leverage_score DROP NOT NULL",
    "ALTER TABLE catcher_grade_outputs ALTER COLUMN count_leverage_label DROP NOT NULL",
    "ALTER TABLE catcher_grade_outputs ALTER COLUMN putaway_count_score DROP NOT NULL",
    "ALTER TABLE catcher_grade_outputs ALTER COLUMN putaway_count_label DROP NOT NULL",
    "ALTER TABLE catcher_grade_outputs ALTER COLUMN damage_avoidance_score DROP NOT NULL",
    "ALTER TABLE catcher_grade_outputs ALTER COLUMN damage_avoidance_label DROP NOT NULL",
    "ALTER TABLE catcher_grade_outputs ALTER COLUMN pitch_mix_synergy_score DROP NOT NULL",
    "ALTER TABLE catcher_grade_outputs ALTER COLUMN pitch_mix_synergy_label DROP NOT NULL",
    "ALTER TABLE catcher_grade_outputs ALTER COLUMN receiving_support_score DROP NOT NULL",
    "ALTER TABLE catcher_grade_outputs ALTER COLUMN receiving_support_label DROP NOT NULL",
]


def get_engine(database_url: str) -> Engine:
    if database_url.startswith("sqlite:///"):
        Path(database_url.replace("sqlite:///", "")).parent.mkdir(parents=True, exist_ok=True)
    return create_engine(database_url, future=True)


def ensure_schema(database_url: str) -> None:
    schema_path = Path(__file__).resolve().parents[5] / "sql" / "schema.sql"
    schema = schema_path.read_text()
    engine = get_engine(database_url)
    with engine.begin() as connection:
        for statement in [chunk.strip() for chunk in schema.split(";") if chunk.strip()]:
            connection.execute(text(statement))
        for statement in SCHEMA_MIGRATIONS:
            connection.execute(text(statement))


def read_dataframe(
    query: str, database_url: str, params: Optional[Dict[str, object]] = None
) -> pd.DataFrame:
    engine = get_engine(database_url)
    return pd.read_sql_query(text(query), engine, params=params)


def write_dataframe(
    frame: pd.DataFrame,
    table_name: str,
    database_url: str,
    if_exists: str = "append",
) -> None:
    engine = get_engine(database_url)
    frame.to_sql(table_name, engine, if_exists=if_exists, index=False)


def execute_sql(
    statement: str,
    database_url: str,
    params: Optional[Dict[str, object]] = None,
) -> None:
    engine = get_engine(database_url)
    with engine.begin() as connection:
        connection.execute(text(statement), params or {})


def upsert_dataframe(
    frame: pd.DataFrame,
    table_name: str,
    conflict_columns: Sequence[str],
    database_url: str,
) -> int:
    if frame.empty:
        return 0

    frame_columns = list(frame.columns)
    missing_conflict_columns = [column for column in conflict_columns if column not in frame_columns]
    if missing_conflict_columns:
        raise ValueError(
            f"Missing conflict columns for upsert into {table_name}: {missing_conflict_columns}"
        )

    staging_table = f"{table_name}_staging"
    quoted_table_name = _quote_identifier(table_name)
    quoted_staging_table = _quote_identifier(staging_table)
    quoted_columns = [_quote_identifier(column) for column in frame_columns]
    quoted_conflict_columns = [_quote_identifier(column) for column in conflict_columns]
    update_columns = [column for column in frame_columns if column not in conflict_columns]
    update_assignments = ", ".join(
        f"{_quote_identifier(column)} = EXCLUDED.{_quote_identifier(column)}"
        for column in update_columns
    )

    insert_sql = f"""
    INSERT INTO {quoted_table_name} ({", ".join(quoted_columns)})
    SELECT {", ".join(quoted_columns)}
    FROM {quoted_staging_table}
    ON CONFLICT ({", ".join(quoted_conflict_columns)}) DO UPDATE SET
        {update_assignments}
    """

    engine = get_engine(database_url)
    with engine.begin() as connection:
        frame.to_sql(staging_table, connection, if_exists="replace", index=False)
        connection.execute(text(insert_sql))
        connection.execute(text(f"DROP TABLE IF EXISTS {quoted_staging_table}"))
    return len(frame)


def replace_date_range(database_url: str, table_name: str, start_date: str, end_date: str) -> None:
    engine = get_engine(database_url)
    with engine.begin() as connection:
        if table_name == "pitch_features":
            connection.execute(
                text(
                    """
                    DELETE FROM pitch_features
                    WHERE EXISTS (
                        SELECT 1
                        FROM pitches_raw raw
                        WHERE raw.pitch_uid = pitch_features.pitch_uid
                          AND raw.game_date BETWEEN :start_date AND :end_date
                    )
                    """
                ),
                {"start_date": start_date, "end_date": end_date},
            )
            return

        if table_name == "catcher_pitch_scores":
            connection.execute(
                text(
                    """
                    DELETE FROM catcher_pitch_scores
                    WHERE EXISTS (
                        SELECT 1
                        FROM pitches_raw raw
                        WHERE raw.pitch_uid = catcher_pitch_scores.pitch_uid
                          AND raw.game_date BETWEEN :start_date AND :end_date
                    )
                    """
                ),
                {"start_date": start_date, "end_date": end_date},
            )
            return

        if table_name == "catcher_game_scores":
            connection.execute(
                text(
                    """
                    DELETE FROM catcher_game_scores
                    WHERE game_date BETWEEN :start_date AND :end_date
                    """
                ),
                {"start_date": start_date, "end_date": end_date},
            )
            return

        connection.execute(
            text(f"DELETE FROM {table_name} WHERE game_date BETWEEN :start_date AND :end_date"),
            {"start_date": start_date, "end_date": end_date},
        )


def clear_table(database_url: str, table_name: str) -> None:
    engine = get_engine(database_url)
    with engine.begin() as connection:
        connection.execute(text(f"DELETE FROM {table_name}"))


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'
