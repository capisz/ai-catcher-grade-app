from __future__ import annotations

from typing import Dict, Iterable, List, Optional, Sequence

import numpy as np
import pandas as pd

from catcher_intel.db import read_dataframe
from catcher_intel.feature_engineering import pitch_type_group

HITTER_FRIENDLY_COUNTS = {"2-0", "2-1", "3-0", "3-1", "3-2"}
PITCHER_FRIENDLY_COUNTS = {"0-1", "0-2", "1-2", "2-2"}
PUTAWAY_COUNTS = {"0-2", "1-2", "2-2"}
DAMAGE_COUNTS = {"2-0", "3-1", "3-2"}
PITCH_FAMILY_ORDER = ["fastball", "breaker", "offspeed"]


def load_eligible_pitch_frame(database_url: str, season: int) -> pd.DataFrame:
    return read_dataframe(
        """
        SELECT
            raw.pitch_uid,
            raw.catcher_id,
            raw.pitcher AS pitcher_id,
            raw.batter AS batter_id,
            raw.game_year AS season,
            raw.game_date,
            raw.pitch_type,
            raw.stand,
            raw.p_throws,
            raw.delta_run_exp,
            features.count_state,
            features.count_bucket,
            features.base_state,
            features.platoon_flag,
            features.zone_bucket_25
        FROM pitches_raw raw
        JOIN pitch_features features
          ON features.pitch_uid = raw.pitch_uid
        WHERE raw.game_year = :season
          AND raw.catcher_id IS NOT NULL
          AND raw.pitch_type IS NOT NULL
          AND raw.delta_run_exp IS NOT NULL
          AND features.zone_bucket_25 IS NOT NULL
        """,
        database_url,
        params={"season": season},
    )


def load_scored_pitch_frame(database_url: str, season: int) -> pd.DataFrame:
    frame = read_dataframe(
        """
        SELECT
            scores.pitch_uid,
            scores.catcher_id,
            COALESCE(scores.game_pk, raw.game_pk) AS game_pk,
            COALESCE(scores.pitcher_id, scores.pitcher, raw.pitcher) AS pitcher_id,
            COALESCE(
                pitcher_identity.full_name,
                pitcher_meta.full_name,
                'Pitcher ' || COALESCE(scores.pitcher_id, scores.pitcher, raw.pitcher)::text
            ) AS pitcher_name,
            COALESCE(scores.batter_id, scores.batter, raw.batter) AS batter_id,
            COALESCE(scores.game_year, raw.game_year) AS season,
            scores.game_date,
            raw.pitch_type,
            raw.stand,
            raw.p_throws,
            features.count_state,
            features.count_bucket,
            features.base_state,
            features.platoon_flag,
            scores.expected_rv_actual,
            scores.expected_rv_baseline,
            scores.dva,
            scores.execution_gap,
            scores.surviving_candidate_count,
            scores.fallback_tier,
            scores.outperformed_baseline
        FROM catcher_pitch_scores scores
        JOIN pitches_raw raw
          ON raw.pitch_uid = scores.pitch_uid
        JOIN pitch_features features
          ON features.pitch_uid = scores.pitch_uid
        LEFT JOIN player_metadata pitcher_meta
          ON pitcher_meta.player_id = COALESCE(scores.pitcher_id, scores.pitcher, raw.pitcher)
         AND pitcher_meta.season = COALESCE(scores.game_year, raw.game_year)
        LEFT JOIN player_identity pitcher_identity
          ON pitcher_identity.key_mlbam = COALESCE(scores.pitcher_id, scores.pitcher, raw.pitcher)
        WHERE COALESCE(scores.game_year, raw.game_year) = :season
          AND scores.catcher_id IS NOT NULL
        """,
        database_url,
        params={"season": season},
    )
    if frame.empty:
        return frame

    frame["game_pk"] = pd.to_numeric(frame["game_pk"], errors="coerce").astype("Int64")
    frame["pitch_family"] = frame["pitch_type"].map(pitch_type_group)
    frame["outperformed_baseline"] = frame["outperformed_baseline"].fillna(frame["dva"] > 0)
    frame["hitter_friendly_flag"] = frame["count_state"].isin(HITTER_FRIENDLY_COUNTS)
    frame["pitcher_friendly_flag"] = frame["count_state"].isin(PITCHER_FRIENDLY_COUNTS)
    frame["putaway_flag"] = frame["count_state"].isin(PUTAWAY_COUNTS)
    frame["damage_flag"] = frame["count_state"].isin(DAMAGE_COUNTS)
    frame["matchup_label"] = frame["stand"].fillna("?") + " bat / " + frame["p_throws"].fillna("?") + " throw"
    return frame


def _aggregate_pitch_logic(frame: pd.DataFrame, group_columns: Sequence[str]) -> pd.DataFrame:
    aggregated = (
        frame.groupby(list(group_columns), dropna=False)
        .agg(
            pitches=("pitch_uid", "size"),
            total_dva=("dva", "sum"),
            avg_dva=("dva", "mean"),
            avg_execution_gap=("execution_gap", "mean"),
            avg_expected_rv_actual=("expected_rv_actual", "mean"),
            outperform_rate=("outperformed_baseline", "mean"),
        )
        .reset_index()
    )
    aggregated["outperform_rate"] = aggregated["outperform_rate"].fillna(0.0)
    return aggregated


def build_count_summaries(scored_frame: pd.DataFrame) -> pd.DataFrame:
    if scored_frame.empty:
        return pd.DataFrame()

    rows: List[Dict[str, object]] = []
    for split_type, split_column in [("count_state", "count_state"), ("count_bucket", "count_bucket")]:
        grouped = scored_frame.groupby(["catcher_id", "season", split_column], dropna=False)
        for (catcher_id, season, split_value), frame in grouped:
            if pd.isna(split_value):
                continue
            family_stats = (
                frame.groupby("pitch_family", dropna=False)
                .agg(
                    pitches=("pitch_uid", "size"),
                    total_dva=("dva", "sum"),
                    avg_dva=("dva", "mean"),
                )
                .reset_index()
            )
            family_lookup = {row["pitch_family"]: row for _, row in family_stats.iterrows()}
            actual_top_pitch_family = (
                family_stats.sort_values(["pitches", "avg_dva"], ascending=[False, False])
                .iloc[0]["pitch_family"]
                if not family_stats.empty
                else None
            )
            recommended_pitch_family = (
                family_stats.sort_values(["avg_dva", "pitches"], ascending=[False, False])
                .iloc[0]["pitch_family"]
                if not family_stats.empty
                else None
            )
            row: Dict[str, object] = {
                "catcher_id": catcher_id,
                "season": season,
                "split_type": split_type,
                "split_value": split_value,
                "pitches": int(len(frame)),
                "total_dva": float(frame["dva"].sum()),
                "avg_dva": float(frame["dva"].mean()),
                "avg_execution_gap": float(frame["execution_gap"].mean()),
                "avg_expected_rv_actual": float(frame["expected_rv_actual"].mean()),
                "outperform_rate": float(frame["outperformed_baseline"].mean()),
                "actual_top_pitch_family": actual_top_pitch_family,
                "recommended_pitch_family": recommended_pitch_family,
                "hitter_friendly_flag": bool(str(split_value) in HITTER_FRIENDLY_COUNTS),
                "pitcher_friendly_flag": bool(str(split_value) in PITCHER_FRIENDLY_COUNTS),
                "putaway_flag": bool(str(split_value) in PUTAWAY_COUNTS),
            }
            for family in PITCH_FAMILY_ORDER:
                family_row = family_lookup.get(family)
                row[f"{family}_rate"] = (
                    float(family_row["pitches"]) / float(len(frame)) if family_row is not None else 0.0
                )
                row[f"{family}_dva"] = float(family_row["avg_dva"]) if family_row is not None else np.nan
            rows.append(row)
    return pd.DataFrame(rows)


def build_pitch_type_summaries(scored_frame: pd.DataFrame) -> pd.DataFrame:
    if scored_frame.empty:
        return pd.DataFrame()

    summary = _aggregate_pitch_logic(scored_frame, ["catcher_id", "season", "pitch_type", "pitch_family"])
    return summary.sort_values(["catcher_id", "season", "pitches"], ascending=[True, True, False])


def build_pairing_summaries(scored_frame: pd.DataFrame) -> pd.DataFrame:
    if scored_frame.empty:
        return pd.DataFrame()

    group_columns = ["catcher_id", "season", "pitcher_id"]
    if "pitcher_name" in scored_frame.columns:
        group_columns.append("pitcher_name")
    summary = _aggregate_pitch_logic(scored_frame, group_columns)
    return summary.sort_values(["catcher_id", "season", "pitches"], ascending=[True, True, False])


def build_matchup_summaries(scored_frame: pd.DataFrame) -> pd.DataFrame:
    if scored_frame.empty:
        return pd.DataFrame()

    summary = _aggregate_pitch_logic(
        scored_frame,
        ["catcher_id", "season", "stand", "p_throws", "matchup_label"],
    )
    summary = summary.drop(columns=["avg_expected_rv_actual"])
    return summary.sort_values(["catcher_id", "season", "matchup_label"])


def build_season_summary(
    scored_frame: pd.DataFrame,
    eligible_frame: pd.DataFrame,
    count_summaries: pd.DataFrame,
    pairing_summaries: pd.DataFrame,
    model_version: str,
) -> pd.DataFrame:
    keep_columns = [
        "catcher_id",
        "season",
        "pitches",
        "games_scored",
        "total_dva",
        "avg_dva",
        "avg_execution_gap",
        "avg_expected_rv_actual",
        "outperform_rate",
        "hitter_friendly_pitches",
        "hitter_friendly_avg_dva",
        "hitter_friendly_outperform_rate",
        "pitcher_friendly_pitches",
        "pitcher_friendly_avg_dva",
        "pitcher_friendly_outperform_rate",
        "putaway_pitches",
        "putaway_avg_dva",
        "putaway_outperform_rate",
        "damage_count_pitches",
        "damage_avoidance_avg_dva",
        "damage_avoidance_expected_rv_actual",
        "count_family_alignment_rate",
        "pairing_avg_dva",
        "pairing_outperform_rate",
        "avg_surviving_candidate_count",
        "single_candidate_pct",
        "dropped_sparse_context_pct",
        "fallback_context_pct",
        "model_version",
    ]
    if eligible_frame.empty:
        return pd.DataFrame()

    if scored_frame.empty:
        return pd.DataFrame(columns=keep_columns)

    eligible_by_catcher = (
        eligible_frame.groupby(["catcher_id", "season"], dropna=False)
        .agg(eligible_pitches=("pitch_uid", "size"))
        .reset_index()
    )

    season_summary = (
        scored_frame.groupby(["catcher_id", "season"], dropna=False)
        .agg(
            pitches=("pitch_uid", "size"),
            games_scored=("game_pk", pd.Series.nunique),
            total_dva=("dva", "sum"),
            avg_dva=("dva", "mean"),
            avg_execution_gap=("execution_gap", "mean"),
            avg_expected_rv_actual=("expected_rv_actual", "mean"),
            outperform_rate=("outperformed_baseline", "mean"),
            avg_surviving_candidate_count=("surviving_candidate_count", "mean"),
            single_candidate_pct=("surviving_candidate_count", lambda values: (values == 1).mean()),
            fallback_context_pct=(
                "fallback_tier",
                lambda values: values.fillna("").ne("exact_count_state_zone25").mean(),
            ),
        )
        .reset_index()
    )
    season_summary = season_summary.merge(
        eligible_by_catcher,
        on=["catcher_id", "season"],
        how="left",
    )
    season_summary["dropped_sparse_context_pct"] = 1.0 - (
        season_summary["pitches"] / season_summary["eligible_pitches"].replace(0, np.nan)
    )
    season_summary["dropped_sparse_context_pct"] = season_summary["dropped_sparse_context_pct"].fillna(0.0)

    for label, mask_column, prefix in [
        ("hitter_friendly", "hitter_friendly_flag", "hitter_friendly"),
        ("pitcher_friendly", "pitcher_friendly_flag", "pitcher_friendly"),
        ("putaway", "putaway_flag", "putaway"),
        ("damage", "damage_flag", "damage_avoidance"),
    ]:
        subset = scored_frame[scored_frame[mask_column]]
        aggregated = (
            subset.groupby(["catcher_id", "season"], dropna=False)
            .agg(
                pitches=("pitch_uid", "size"),
                avg_dva=("dva", "mean"),
                outperform_rate=("outperformed_baseline", "mean"),
                avg_expected_rv_actual=("expected_rv_actual", "mean"),
            )
            .reset_index()
        )
        season_summary = season_summary.merge(
            aggregated.rename(
                columns={
                    "pitches": f"{prefix}_pitches",
                    "avg_dva": f"{prefix}_avg_dva",
                    "outperform_rate": f"{prefix}_outperform_rate",
                    "avg_expected_rv_actual": f"{prefix}_expected_rv_actual",
                }
            ),
            on=["catcher_id", "season"],
            how="left",
        )

    count_state_summaries = count_summaries[count_summaries["split_type"] == "count_state"].copy()
    if not count_state_summaries.empty:
        aligned_frame = count_state_summaries.assign(
            aligned=lambda frame: frame["actual_top_pitch_family"]
            .eq(frame["recommended_pitch_family"])
            .fillna(False)
        )
        alignment = (
            aligned_frame.groupby(["catcher_id", "season"], dropna=False)[["aligned", "pitches"]]
            .apply(
                lambda frame: np.average(
                    frame["aligned"].astype(float),
                    weights=frame["pitches"].clip(lower=1),
                )
            )
            .reset_index(name="count_family_alignment_rate")
        )
        season_summary = season_summary.merge(alignment, on=["catcher_id", "season"], how="left")
    else:
        season_summary["count_family_alignment_rate"] = np.nan

    if not pairing_summaries.empty:
        pairing_rollup = (
            pairing_summaries[pairing_summaries["pitches"] >= 10]
            .groupby(["catcher_id", "season"], dropna=False)
            .agg(
                pairing_avg_dva=("avg_dva", "mean"),
                pairing_outperform_rate=("outperform_rate", "mean"),
            )
            .reset_index()
        )
        season_summary = season_summary.merge(
            pairing_rollup,
            on=["catcher_id", "season"],
            how="left",
        )
    else:
        season_summary["pairing_avg_dva"] = np.nan
        season_summary["pairing_outperform_rate"] = np.nan

    season_summary["model_version"] = model_version
    season_summary["outperform_rate"] = season_summary["outperform_rate"].fillna(0.0)
    season_summary["single_candidate_pct"] = season_summary["single_candidate_pct"].fillna(0.0)
    season_summary["fallback_context_pct"] = season_summary["fallback_context_pct"].fillna(0.0)
    season_summary = season_summary.rename(
        columns={"damage_avoidance_pitches": "damage_count_pitches"}
    )
    return season_summary[keep_columns]


def build_scoring_diagnostics(
    scored_frame: pd.DataFrame,
    eligible_frame: pd.DataFrame,
    season_summary: pd.DataFrame,
    season: int,
    model_version: str,
) -> pd.DataFrame:
    eligible_pitches = int(len(eligible_frame))
    scored_pitches = int(len(scored_frame))
    dropped = max(eligible_pitches - scored_pitches, 0)
    if season_summary.empty:
        single_candidate_pct = 0.0
    else:
        single_candidate_pct = float(season_summary["single_candidate_pct"].mean())
    return pd.DataFrame(
        [
            {
                "season": season,
                "model_version": model_version,
                "eligible_pitches": eligible_pitches,
                "scored_pitches": scored_pitches,
                "dropped_sparse_context_pitches": dropped,
                "dropped_sparse_context_pct": (dropped / eligible_pitches) if eligible_pitches else 0.0,
                "single_candidate_context_pct": single_candidate_pct,
            }
        ]
    )


def build_summary_outputs(database_url: str, season: int, model_version: str) -> Dict[str, pd.DataFrame]:
    eligible_frame = load_eligible_pitch_frame(database_url, season)
    scored_frame = load_scored_pitch_frame(database_url, season)
    count_summaries = build_count_summaries(scored_frame)
    pitch_type_summaries = build_pitch_type_summaries(scored_frame)
    pairing_summaries = build_pairing_summaries(scored_frame)
    matchup_summaries = build_matchup_summaries(scored_frame)
    season_summary = build_season_summary(
        scored_frame,
        eligible_frame,
        count_summaries,
        pairing_summaries,
        model_version,
    )
    diagnostics = build_scoring_diagnostics(
        scored_frame,
        eligible_frame,
        season_summary,
        season,
        model_version,
    )
    return {
        "season_summary": season_summary,
        "count_summaries": count_summaries,
        "pitch_type_summaries": pitch_type_summaries,
        "pairing_summaries": pairing_summaries,
        "matchup_summaries": matchup_summaries,
        "diagnostics": diagnostics,
    }
