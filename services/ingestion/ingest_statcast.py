from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta
from typing import Iterable

import pandas as pd
from pybaseball import statcast
from sqlalchemy import create_engine, text


RAW_COLUMNS = [
    "game_pk",
    "game_date",
    "game_year",
    "at_bat_number",
    "pitch_number",
    "pitcher",
    "batter",
    "fielder_2",
    "pitch_type",
    "pitch_name",
    "stand",
    "p_throws",
    "balls",
    "strikes",
    "outs_when_up",
    "on_1b",
    "on_2b",
    "on_3b",
    "inning",
    "inning_topbot",
    "plate_x",
    "plate_z",
    "zone",
    "sz_top",
    "sz_bot",
    "release_speed",
    "release_spin_rate",
    "pfx_x",
    "pfx_z",
    "effective_speed",
    "description",
    "events",
    "estimated_woba_using_speedangle",
    "delta_run_exp",
]

RENAME_MAP = {
    "fielder_2": "catcher_id",
    "release_spin_rate": "release_spin",
}


def daterange_chunks(start_dt: date, end_dt: date, chunk_days: int = 7) -> Iterable[tuple[date, date]]:
    current = start_dt
    while current <= end_dt:
        chunk_end = min(current + timedelta(days=chunk_days - 1), end_dt)
        yield current, chunk_end
        current = chunk_end + timedelta(days=1)


def make_pitch_uid(df: pd.DataFrame) -> pd.Series:
    return (
        df["game_pk"].astype(str)
        + "_"
        + df["at_bat_number"].astype("Int64").astype(str)
        + "_"
        + df["pitch_number"].astype("Int64").astype(str)
    )


def normalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    missing = [c for c in RAW_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing expected Statcast columns: {missing}")

    out = df[RAW_COLUMNS].copy()
    out = out.rename(columns=RENAME_MAP)

    out["game_date"] = pd.to_datetime(out["game_date"]).dt.date

    numeric_cols = [
        "game_pk", "game_year", "at_bat_number", "pitch_number",
        "pitcher", "batter", "catcher_id",
        "balls", "strikes", "outs_when_up",
        "on_1b", "on_2b", "on_3b",
        "inning", "zone",
        "plate_x", "plate_z", "sz_top", "sz_bot",
        "release_speed", "release_spin", "pfx_x", "pfx_z",
        "effective_speed", "estimated_woba_using_speedangle", "delta_run_exp",
    ]
    for col in numeric_cols:
        if col in out.columns:
            out[col] = pd.to_numeric(out[col], errors="coerce")

    out["pitch_uid"] = make_pitch_uid(out)

    ordered_cols = [
        "pitch_uid",
        "game_pk",
        "game_date",
        "game_year",
        "at_bat_number",
        "pitch_number",
        "pitcher",
        "batter",
        "catcher_id",
        "pitch_type",
        "pitch_name",
        "stand",
        "p_throws",
        "balls",
        "strikes",
        "outs_when_up",
        "on_1b",
        "on_2b",
        "on_3b",
        "inning",
        "inning_topbot",
        "plate_x",
        "plate_z",
        "zone",
        "sz_top",
        "sz_bot",
        "release_speed",
        "release_spin",
        "pfx_x",
        "pfx_z",
        "effective_speed",
        "description",
        "events",
        "estimated_woba_using_speedangle",
        "delta_run_exp",
    ]
    return out[ordered_cols]


def upsert_dataframe(df: pd.DataFrame, db_url: str, table_name: str = "pitches_raw") -> None:
    if df.empty:
        return

    engine = create_engine(db_url)
    temp_table = f"{table_name}_staging"

    with engine.begin() as conn:
        df.to_sql(temp_table, conn, if_exists="replace", index=False)

        insert_sql = f"""
        INSERT INTO {table_name} (
            pitch_uid, game_pk, game_date, game_year, at_bat_number, pitch_number,
            pitcher, batter, catcher_id, pitch_type, pitch_name, stand, p_throws,
            balls, strikes, outs_when_up, on_1b, on_2b, on_3b, inning, inning_topbot,
            plate_x, plate_z, zone, sz_top, sz_bot, release_speed, release_spin,
            pfx_x, pfx_z, effective_speed, description, events,
            estimated_woba_using_speedangle, delta_run_exp
        )
        SELECT
            pitch_uid, game_pk, game_date, game_year, at_bat_number, pitch_number,
            pitcher, batter, catcher_id, pitch_type, pitch_name, stand, p_throws,
            balls, strikes, outs_when_up, on_1b, on_2b, on_3b, inning, inning_topbot,
            plate_x, plate_z, zone, sz_top, sz_bot, release_speed, release_spin,
            pfx_x, pfx_z, effective_speed, description, events,
            estimated_woba_using_speedangle, delta_run_exp
        FROM {temp_table}
        ON CONFLICT (pitch_uid) DO UPDATE SET
            game_pk = EXCLUDED.game_pk,
            game_date = EXCLUDED.game_date,
            game_year = EXCLUDED.game_year,
            at_bat_number = EXCLUDED.at_bat_number,
            pitch_number = EXCLUDED.pitch_number,
            pitcher = EXCLUDED.pitcher,
            batter = EXCLUDED.batter,
            catcher_id = EXCLUDED.catcher_id,
            pitch_type = EXCLUDED.pitch_type,
            pitch_name = EXCLUDED.pitch_name,
            stand = EXCLUDED.stand,
            p_throws = EXCLUDED.p_throws,
            balls = EXCLUDED.balls,
            strikes = EXCLUDED.strikes,
            outs_when_up = EXCLUDED.outs_when_up,
            on_1b = EXCLUDED.on_1b,
            on_2b = EXCLUDED.on_2b,
            on_3b = EXCLUDED.on_3b,
            inning = EXCLUDED.inning,
            inning_topbot = EXCLUDED.inning_topbot,
            plate_x = EXCLUDED.plate_x,
            plate_z = EXCLUDED.plate_z,
            zone = EXCLUDED.zone,
            sz_top = EXCLUDED.sz_top,
            sz_bot = EXCLUDED.sz_bot,
            release_speed = EXCLUDED.release_speed,
            release_spin = EXCLUDED.release_spin,
            pfx_x = EXCLUDED.pfx_x,
            pfx_z = EXCLUDED.pfx_z,
            effective_speed = EXCLUDED.effective_speed,
            description = EXCLUDED.description,
            events = EXCLUDED.events,
            estimated_woba_using_speedangle = EXCLUDED.estimated_woba_using_speedangle,
            delta_run_exp = EXCLUDED.delta_run_exp;
        """
        conn.execute(text(insert_sql))
        conn.execute(text(f"DROP TABLE IF EXISTS {temp_table}"))


def ingest_range(start_date: str, end_date: str, db_url: str, chunk_days: int = 7) -> None:
    start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()

    for chunk_start, chunk_end in daterange_chunks(start_dt, end_dt, chunk_days=chunk_days):
        print(f"Pulling {chunk_start} -> {chunk_end}")
        df = statcast(start_dt=str(chunk_start), end_dt=str(chunk_end))
        if df is None or df.empty:
            print("  no rows")
            continue

        norm = normalize_dataframe(df)
        upsert_dataframe(norm, db_url=db_url)
        print(f"  wrote {len(norm):,} rows")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-date", required=True, help="YYYY-MM-DD")
    parser.add_argument("--end-date", required=True, help="YYYY-MM-DD")
    parser.add_argument("--db-url", required=True, help="Postgres SQLAlchemy URL")
    parser.add_argument("--chunk-days", type=int, default=7)
    args = parser.parse_args()

    ingest_range(
        start_date=args.start_date,
        end_date=args.end_date,
        db_url=args.db_url,
        chunk_days=args.chunk_days,
    )


if __name__ == "__main__":
    main()
