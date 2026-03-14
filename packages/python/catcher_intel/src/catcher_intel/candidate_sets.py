from __future__ import annotations

from typing import Optional

import pandas as pd

from catcher_intel.feature_engineering import pitch_type_group

CONTEXT_COLUMNS = ["pitcher", "count_bucket", "base_state", "outs_state", "platoon_flag"]


def build_candidate_pitch_sets(
    raw_frame: pd.DataFrame, feature_frame: pd.DataFrame, min_pitch_usage: float = 0.05
) -> pd.DataFrame:
    merged = raw_frame.merge(feature_frame, on="pitch_uid")

    pitch_usage = (
        merged.groupby(CONTEXT_COLUMNS + ["pitch_type"], dropna=False)
        .agg(
            pitch_name=("pitch_name", _mode),
            pitch_type_count=("pitch_type", "size"),
        )
        .reset_index()
    )
    pitch_usage["context_total"] = pitch_usage.groupby(CONTEXT_COLUMNS)["pitch_type_count"].transform(
        "sum"
    )
    pitch_usage["pitch_type_usage"] = (
        pitch_usage["pitch_type_count"] / pitch_usage["context_total"]
    )
    pitch_usage["pitch_type_rank"] = pitch_usage.groupby(CONTEXT_COLUMNS)["pitch_type_usage"].rank(
        method="dense", ascending=False
    )
    pitch_usage["pitch_type_group"] = pitch_usage["pitch_type"].apply(pitch_type_group)

    eligible_pitches = pitch_usage[
        (pitch_usage["pitch_type_usage"] >= min_pitch_usage)
        | (pitch_usage["pitch_type_rank"] <= 3)
    ].drop(columns=["pitch_type_rank", "context_total"])

    location_frame = merged.merge(
        eligible_pitches,
        on=CONTEXT_COLUMNS + ["pitch_type"],
        how="inner",
        suffixes=("", "_usage"),
    )
    location_frame = location_frame[location_frame["zone_bucket_25"].notna()]

    candidates = (
        location_frame.groupby(
            CONTEXT_COLUMNS
            + ["pitch_type", "pitch_name_usage", "pitch_type_group", "zone_bucket_25"],
            dropna=False,
        )
        .agg(
            pitch_count=("pitch_type", "size"),
            target_plate_x=("plate_x", "median"),
            target_plate_z=("plate_z", "median"),
            sz_top=("sz_top", "median"),
            sz_bot=("sz_bot", "median"),
            release_speed=("release_speed", "median"),
            release_spin=("release_spin", "median"),
            pfx_x=("pfx_x", "median"),
            pfx_z=("pfx_z", "median"),
            effective_speed=("effective_speed", "median"),
            pitch_type_usage=("pitch_type_usage", "first"),
            pitch_type_count=("pitch_type_count", "first"),
        )
        .reset_index()
        .rename(columns={"pitch_name_usage": "pitch_name"})
    )

    candidates["location_usage"] = candidates["pitch_count"] / candidates["pitch_type_count"]
    candidates["candidate_prob"] = (
        candidates["pitch_type_usage"] * candidates["location_usage"]
    )
    context_probability = candidates.groupby(CONTEXT_COLUMNS)["candidate_prob"].transform("sum")
    candidates["candidate_prob"] = candidates["candidate_prob"] / context_probability
    candidates = candidates.drop(columns=["pitch_type_count"])
    return candidates.sort_values(
        CONTEXT_COLUMNS + ["candidate_prob"], ascending=[True, True, True, True, True, False]
    )


def _mode(values: pd.Series) -> Optional[str]:
    non_null = values.dropna()
    if non_null.empty:
        return None
    return str(non_null.mode().iloc[0])
