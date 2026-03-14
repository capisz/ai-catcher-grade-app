from __future__ import annotations

import argparse

import pandas as pd
from sqlalchemy import create_engine, text

from features import build_features


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate and upsert pitch_features from pitches_raw.")
    parser.add_argument(
        "--db-url",
        required=True,
        help="Postgres SQLAlchemy URL",
    )
    return parser.parse_args()


def load_source_pitches(db_url: str) -> pd.DataFrame:
    query = """
    SELECT
        pitch_uid,
        game_pk,
        at_bat_number,
        pitch_number,
        pitch_type,
        stand,
        p_throws,
        balls,
        strikes,
        outs_when_up,
        on_1b,
        on_2b,
        on_3b,
        plate_x,
        plate_z,
        sz_top,
        sz_bot
    FROM pitches_raw
    WHERE pitch_type IS NOT NULL
    """
    engine = create_engine(db_url, future=True)
    return pd.read_sql(query, engine)


def upsert_features(features: pd.DataFrame, db_url: str) -> int:
    if features.empty:
        return 0

    engine = create_engine(db_url, future=True)
    with engine.begin() as connection:
        features.to_sql("pitch_features_staging", connection, if_exists="replace", index=False)
        connection.execute(
            text(
                """
                INSERT INTO pitch_features (
                    pitch_uid,
                    count_state,
                    count_bucket,
                    base_state,
                    outs_state,
                    platoon_flag,
                    zone_bucket_9,
                    zone_bucket_25,
                    edge_flag,
                    chase_zone_flag,
                    waste_zone_flag,
                    prev_pitch_type_1,
                    prev_pitch_type_2,
                    same_as_prev_pitch,
                    same_tunnel_family
                )
                SELECT
                    pitch_uid,
                    count_state,
                    count_bucket,
                    base_state,
                    outs_state,
                    platoon_flag,
                    zone_bucket_9,
                    zone_bucket_25,
                    edge_flag,
                    chase_zone_flag,
                    waste_zone_flag,
                    prev_pitch_type_1,
                    prev_pitch_type_2,
                    same_as_prev_pitch,
                    same_tunnel_family
                FROM pitch_features_staging
                ON CONFLICT (pitch_uid) DO UPDATE SET
                    count_state = EXCLUDED.count_state,
                    count_bucket = EXCLUDED.count_bucket,
                    base_state = EXCLUDED.base_state,
                    outs_state = EXCLUDED.outs_state,
                    platoon_flag = EXCLUDED.platoon_flag,
                    zone_bucket_9 = EXCLUDED.zone_bucket_9,
                    zone_bucket_25 = EXCLUDED.zone_bucket_25,
                    edge_flag = EXCLUDED.edge_flag,
                    chase_zone_flag = EXCLUDED.chase_zone_flag,
                    waste_zone_flag = EXCLUDED.waste_zone_flag,
                    prev_pitch_type_1 = EXCLUDED.prev_pitch_type_1,
                    prev_pitch_type_2 = EXCLUDED.prev_pitch_type_2,
                    same_as_prev_pitch = EXCLUDED.same_as_prev_pitch,
                    same_tunnel_family = EXCLUDED.same_tunnel_family
                """
            )
        )
        connection.execute(text("DROP TABLE IF EXISTS pitch_features_staging"))
    return len(features)


def main() -> None:
    args = parse_args()
    source_pitches = load_source_pitches(args.db_url)
    features = build_features(source_pitches)
    row_count = upsert_features(features, args.db_url)
    print(f"Loaded {row_count:,} feature rows into pitch_features")


if __name__ == "__main__":
    main()
