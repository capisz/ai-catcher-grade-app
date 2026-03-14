from __future__ import annotations

from typing import Iterable, Optional

import numpy as np
import pandas as pd

SOURCE_COLUMNS = [
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

RAW_OUTPUT_COLUMNS = [
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

FEATURE_COLUMNS = [
    "pitch_uid",
    "count_state",
    "count_bucket",
    "base_state",
    "outs_state",
    "platoon_flag",
    "zone_bucket_9",
    "zone_bucket_25",
    "edge_flag",
    "chase_zone_flag",
    "waste_zone_flag",
    "prev_pitch_type_1",
    "prev_pitch_type_2",
    "same_as_prev_pitch",
    "same_tunnel_family",
]

EDGE_BUCKETS_25 = {
    "0_1",
    "0_2",
    "0_3",
    "1_0",
    "1_4",
    "2_0",
    "2_4",
    "3_0",
    "3_4",
    "4_1",
    "4_2",
    "4_3",
}

FASTBALL_TYPES = {"FA", "FC", "FF", "FT", "SI"}
BREAKER_TYPES = {"CS", "CU", "KC", "KN", "SC", "SL", "ST", "SV"}
OFFSPEED_TYPES = {"CH", "EP", "FO", "FS"}


def make_pitch_uid(df: pd.DataFrame) -> pd.Series:
    return (
        df["game_pk"].astype("Int64").astype(str)
        + "_"
        + df["at_bat_number"].astype("Int64").astype(str)
        + "_"
        + df["pitch_number"].astype("Int64").astype(str)
    )


def normalize_statcast_frame(frame: pd.DataFrame) -> pd.DataFrame:
    normalized = frame.copy()
    if "release_spin_rate" not in normalized.columns and "release_spin" in normalized.columns:
        normalized["release_spin_rate"] = normalized["release_spin"]

    for column in SOURCE_COLUMNS:
        if column not in normalized.columns:
            normalized[column] = np.nan

    normalized = normalized[SOURCE_COLUMNS].rename(columns=RENAME_MAP)
    normalized["game_date"] = pd.to_datetime(normalized["game_date"]).dt.date
    normalized["game_year"] = pd.to_numeric(normalized["game_year"], errors="coerce").fillna(
        pd.to_datetime(normalized["game_date"]).dt.year
    )
    normalized["game_year"] = normalized["game_year"].astype("Int64")

    integer_columns = [
        "game_pk",
        "game_year",
        "at_bat_number",
        "pitch_number",
        "pitcher",
        "batter",
        "catcher_id",
        "balls",
        "strikes",
        "outs_when_up",
        "on_1b",
        "on_2b",
        "on_3b",
        "inning",
        "zone",
    ]
    for column in integer_columns:
        normalized[column] = pd.to_numeric(normalized[column], errors="coerce").astype("Int64")

    float_columns = [
        "plate_x",
        "plate_z",
        "sz_top",
        "sz_bot",
        "release_speed",
        "release_spin",
        "pfx_x",
        "pfx_z",
        "effective_speed",
        "estimated_woba_using_speedangle",
        "delta_run_exp",
    ]
    for column in float_columns:
        normalized[column] = pd.to_numeric(normalized[column], errors="coerce")

    normalized["pitch_uid"] = make_pitch_uid(normalized)
    normalized = normalized[RAW_OUTPUT_COLUMNS]
    return normalized.sort_values(["game_date", "game_pk", "at_bat_number", "pitch_number"])


def build_features(raw_frame: pd.DataFrame) -> pd.DataFrame:
    out = raw_frame.sort_values(["game_pk", "at_bat_number", "pitch_number"]).copy()
    out["count_state"] = (
        out["balls"].astype("Int64").astype(str) + "-" + out["strikes"].astype("Int64").astype(str)
    )
    out["count_bucket"] = out.apply(
        lambda row: count_bucket_from_values(row["balls"], row["strikes"]), axis=1
    )
    out["base_state"] = out.apply(base_state_from_row, axis=1)
    out["outs_state"] = out["outs_when_up"].astype("Int64").astype(str)
    out["platoon_flag"] = np.where(
        out["stand"] == out["p_throws"], "same_side", "opposite_side"
    )

    out = normalize_zone_coords(out)
    out["zone_bucket_9"] = zone_bucket(out, bins=3)
    out["zone_bucket_25"] = zone_bucket(out, bins=5)
    out["edge_flag"] = out["zone_bucket_25"].isin(EDGE_BUCKETS_25)
    out["chase_zone_flag"] = (
        (
            (out["x_norm"] > 1.0)
            | (out["x_norm"] < -1.0)
            | (out["z_norm"] < 0.0)
            | (out["z_norm"] > 1.0)
        )
        & (
            (out["x_norm"] <= 1.3)
            & (out["x_norm"] >= -1.3)
            & (out["z_norm"] >= -0.25)
            & (out["z_norm"] <= 1.25)
        )
    ).fillna(False)
    out["waste_zone_flag"] = (
        (out["x_norm"] > 1.3)
        | (out["x_norm"] < -1.3)
        | (out["z_norm"] < -0.25)
        | (out["z_norm"] > 1.25)
    ).fillna(False)

    out = add_sequence_features(out)
    return out


def derive_feature_frame(raw_frame: pd.DataFrame) -> pd.DataFrame:
    feature_frame = build_features(raw_frame)
    return feature_frame[FEATURE_COLUMNS]


def base_state_from_row(row: pd.Series) -> str:
    return "".join(
        "1" if pd.notna(row[column]) else "0" for column in ["on_1b", "on_2b", "on_3b"]
    )


def count_bucket_from_values(balls: object, strikes: object) -> str:
    balls_value = int(pd.to_numeric(balls, errors="coerce") if pd.notna(balls) else 0)
    strikes_value = int(pd.to_numeric(strikes, errors="coerce") if pd.notna(strikes) else 0)
    if balls_value == 3 and strikes_value == 2:
        return "full_count"
    if balls_value > strikes_value and balls_value >= 2:
        return "hitter_ahead"
    if strikes_value > balls_value:
        return "pitcher_ahead"
    return "even"


def normalize_zone_coords(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    zone_height = (out["sz_top"] - out["sz_bot"]).replace(0, np.nan)
    out["z_norm"] = (out["plate_z"] - out["sz_bot"]) / zone_height
    out["x_norm"] = out["plate_x"] / 0.83
    return out


def bucket_axis(val: object, bins: int, lower: float, upper: float) -> Optional[int]:
    if pd.isna(val):
        return None
    if float(val) < lower or float(val) > upper:
        return None
    width = (upper - lower) / bins
    idx = int((float(val) - lower) / width)
    return min(idx, bins - 1)


def zone_bucket(df: pd.DataFrame, bins: int = 5) -> pd.Series:
    coords = []
    for _, row in df.iterrows():
        x_bucket = bucket_axis(row["x_norm"], bins=bins, lower=-1.5, upper=1.5)
        z_bucket = bucket_axis(row["z_norm"], bins=bins, lower=-0.5, upper=1.5)
        coords.append(None if x_bucket is None or z_bucket is None else f"{z_bucket}_{x_bucket}")
    return pd.Series(coords, index=df.index, dtype="object")


def add_sequence_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.sort_values(["game_pk", "at_bat_number", "pitch_number"]).copy()
    grouped = out.groupby(["game_pk", "at_bat_number"], sort=False)
    out["prev_pitch_type_1"] = grouped["pitch_type"].shift(1).fillna("NONE")
    out["prev_pitch_type_2"] = grouped["pitch_type"].shift(2).fillna("NONE")
    out["same_as_prev_pitch"] = out["pitch_type"].eq(out["prev_pitch_type_1"]).fillna(False)
    out["same_tunnel_family"] = out.apply(_same_tunnel_family, axis=1)
    return out


def pitch_type_group(pitch_type: object) -> str:
    if pd.isna(pitch_type):
        return "unknown"
    code = str(pitch_type)
    if code in FASTBALL_TYPES:
        return "fastball"
    if code in BREAKER_TYPES:
        return "breaker"
    if code in OFFSPEED_TYPES:
        return "offspeed"
    return "unknown"


def zone_bucket_to_display(zone_bucket_value: object) -> str:
    if pd.isna(zone_bucket_value) or zone_bucket_value in (None, "unknown"):
        return "unknown"
    row_text, column_text = str(zone_bucket_value).split("_")
    row_index = int(row_text)
    column_index = int(column_text)
    display_row = 5 - row_index
    display_column = column_index + 1
    return f"r{display_row}c{display_column}"


def zone_bucket_25_to_9(zone_bucket_value: object) -> Optional[str]:
    if pd.isna(zone_bucket_value) or zone_bucket_value in (None, "unknown"):
        return None
    row_text, column_text = str(zone_bucket_value).split("_")
    row_index = int(int(row_text) * 3 / 5)
    column_index = int(int(column_text) * 3 / 5)
    return f"{row_index}_{column_index}"


def model_feature_columns() -> Iterable[str]:
    return [
        "pitch_type",
        "stand",
        "p_throws",
        "count_state",
        "count_bucket",
        "base_state",
        "outs_state",
        "platoon_flag",
        "zone_bucket_9",
        "zone_bucket_25",
        "prev_pitch_type_1",
        "prev_pitch_type_2",
        "plate_x",
        "plate_z",
        "sz_top",
        "sz_bot",
        "release_speed",
        "release_spin",
        "pfx_x",
        "pfx_z",
        "effective_speed",
    ]


def _same_tunnel_family(row: pd.Series) -> bool:
    previous_pitch = row.get("prev_pitch_type_1")
    if previous_pitch in (None, "NONE") or pd.isna(previous_pitch):
        return False
    return pitch_type_group(row.get("pitch_type")) == pitch_type_group(previous_pitch)
