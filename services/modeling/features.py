from __future__ import annotations

import numpy as np
import pandas as pd


def base_state(row: pd.Series) -> str:
    return "".join([
        "1" if pd.notna(row["on_1b"]) else "0",
        "1" if pd.notna(row["on_2b"]) else "0",
        "1" if pd.notna(row["on_3b"]) else "0",
    ])


def count_bucket(balls: int, strikes: int) -> str:
    if balls == 3 and strikes == 2:
        return "full_count"
    if balls > strikes and balls >= 2:
        return "hitter_ahead"
    if strikes > balls:
        return "pitcher_ahead"
    return "even"


def normalize_zone_coords(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    zone_height = (out["sz_top"] - out["sz_bot"]).replace(0, np.nan)
    out["z_norm"] = (out["plate_z"] - out["sz_bot"]) / zone_height
    out["x_norm"] = out["plate_x"] / 0.83
    return out


def bucket_axis(val: float, bins: int, lower: float, upper: float):
    if pd.isna(val):
        return None
    if val < lower or val > upper:
        return None
    width = (upper - lower) / bins
    idx = int((val - lower) / width)
    return min(idx, bins - 1)


def zone_bucket(df: pd.DataFrame, bins: int = 5) -> pd.Series:
    coords = []
    for _, row in df.iterrows():
        x = bucket_axis(row["x_norm"], bins=bins, lower=-1.5, upper=1.5)
        z = bucket_axis(row["z_norm"], bins=bins, lower=-0.5, upper=1.5)
        coords.append(None if x is None or z is None else f"{z}_{x}")
    return pd.Series(coords, index=df.index)


def add_sequence_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.sort_values(["game_pk", "at_bat_number", "pitch_number"]).copy()
    grp = out.groupby(["game_pk", "at_bat_number"], sort=False)
    out["prev_pitch_type_1"] = grp["pitch_type"].shift(1)
    out["prev_pitch_type_2"] = grp["pitch_type"].shift(2)
    out["same_as_prev_pitch"] = out["pitch_type"].eq(out["prev_pitch_type_1"])
    out["same_tunnel_family"] = False
    return out


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["count_state"] = out["balls"].astype("Int64").astype(str) + "-" + out["strikes"].astype("Int64").astype(str)
    out["count_bucket"] = out.apply(lambda r: count_bucket(int(r["balls"]), int(r["strikes"])), axis=1)
    out["base_state"] = out.apply(base_state, axis=1)
    out["outs_state"] = out["outs_when_up"].astype("Int64").astype(str)
    out["platoon_flag"] = np.where(out["stand"] == out["p_throws"], "same_side", "opposite_side")

    out = normalize_zone_coords(out)
    out["zone_bucket_9"] = zone_bucket(out, bins=3)
    out["zone_bucket_25"] = zone_bucket(out, bins=5)

    out["edge_flag"] = out["zone_bucket_25"].isin({
        "0_1", "0_2", "0_3",
        "1_0", "1_4",
        "2_0", "2_4",
        "3_0", "3_4",
        "4_1", "4_2", "4_3"
    })

    out["chase_zone_flag"] = (
        ((out["x_norm"] > 1.0) | (out["x_norm"] < -1.0) | (out["z_norm"] < 0.0) | (out["z_norm"] > 1.0))
        & ((out["x_norm"] <= 1.3) & (out["x_norm"] >= -1.3) & (out["z_norm"] >= -0.25) & (out["z_norm"] <= 1.25))
    )

    out["waste_zone_flag"] = (
        (out["x_norm"] > 1.3) | (out["x_norm"] < -1.3) | (out["z_norm"] < -0.25) | (out["z_norm"] > 1.25)
    )

    out = add_sequence_features(out)

    keep_cols = [
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
    return out[keep_cols]
