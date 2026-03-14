from __future__ import annotations

import argparse
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence

import numpy as np
import pandas as pd

from catcher_intel.db import ensure_schema, execute_sql, read_dataframe, upsert_dataframe

MODEL_VERSION = "dva_v1_contextual"
MIN_BASELINE_SAMPLE = 5
MIN_CANDIDATE_COUNT = 3
MIN_CANDIDATE_PROB = 0.05


@dataclass(frozen=True)
class ScoringTier:
    name: str
    baseline_context_columns: Sequence[str]
    candidate_context_columns: Sequence[str]
    option_columns: Sequence[str]

    @property
    def baseline_merge_columns(self) -> List[str]:
        return ["pitch_type", *self.baseline_context_columns]

    @property
    def shared_context_columns(self) -> List[str]:
        option_set = set(self.option_columns)
        return [column for column in self.baseline_context_columns if column not in option_set]

    @property
    def candidate_baseline_merge_columns(self) -> List[str]:
        return [*self.shared_context_columns, *self.option_columns]


SCORING_TIERS = [
    ScoringTier(
        name="exact_count_state_zone25",
        baseline_context_columns=["count_state", "base_state", "platoon_flag", "zone_bucket_25"],
        candidate_context_columns=["pitcher_id", "count_state", "base_state", "platoon_flag"],
        option_columns=["pitch_type", "zone_bucket_25"],
    ),
    ScoringTier(
        name="count_bucket_zone25",
        baseline_context_columns=["count_bucket", "base_state", "platoon_flag", "zone_bucket_25"],
        candidate_context_columns=["pitcher_id", "count_bucket", "base_state", "platoon_flag"],
        option_columns=["pitch_type", "zone_bucket_25"],
    ),
    ScoringTier(
        name="count_bucket_zone9",
        baseline_context_columns=["count_bucket", "base_state", "platoon_flag", "zone_bucket_9"],
        candidate_context_columns=["pitcher_id", "count_bucket", "base_state", "platoon_flag"],
        option_columns=["pitch_type", "zone_bucket_9"],
    ),
    ScoringTier(
        name="count_bucket_no_zone",
        baseline_context_columns=["count_bucket", "base_state", "platoon_flag"],
        candidate_context_columns=["pitcher_id", "count_bucket", "base_state", "platoon_flag"],
        option_columns=["pitch_type"],
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score first-pass catcher DVA into Postgres.")
    parser.add_argument("--db-url", required=True, help="Postgres SQLAlchemy URL")
    parser.add_argument(
        "--season",
        type=int,
        action="append",
        help="Optional season filter. Repeat the flag to score multiple seasons.",
    )
    parser.add_argument("--model-version", default=MODEL_VERSION)
    parser.add_argument("--min-baseline-sample", type=int, default=MIN_BASELINE_SAMPLE)
    parser.add_argument("--min-candidate-count", type=int, default=MIN_CANDIDATE_COUNT)
    parser.add_argument("--min-candidate-prob", type=float, default=MIN_CANDIDATE_PROB)
    return parser.parse_args()


def resolve_seasons(database_url: str, seasons: Optional[Sequence[int]]) -> List[int]:
    if seasons:
        return sorted({int(season) for season in seasons})

    frame = read_dataframe(
        """
        SELECT DISTINCT game_year
        FROM pitches_raw
        WHERE game_year IS NOT NULL
        ORDER BY game_year
        """,
        database_url,
    )
    return [int(value) for value in frame["game_year"].dropna().tolist()]


def load_scoring_frame(database_url: str, seasons: Sequence[int]) -> pd.DataFrame:
    if not seasons:
        return pd.DataFrame()

    season_sql = ", ".join(str(int(season)) for season in seasons)
    frame = read_dataframe(
        f"""
        SELECT
            raw.pitch_uid,
            raw.game_pk,
            raw.game_date,
            raw.game_year,
            raw.catcher_id,
            raw.pitcher AS pitcher,
            raw.batter AS batter,
            raw.pitcher AS pitcher_id,
            raw.batter AS batter_id,
            raw.pitch_type,
            raw.pitch_name,
            raw.stand,
            raw.p_throws,
            raw.delta_run_exp,
            raw.plate_x,
            raw.plate_z,
            raw.sz_top,
            raw.sz_bot,
            raw.release_speed,
            raw.release_spin,
            raw.pfx_x,
            raw.pfx_z,
            raw.effective_speed,
            features.count_state,
            features.count_bucket,
            features.base_state,
            features.outs_state,
            features.platoon_flag,
            features.zone_bucket_25,
            features.zone_bucket_9
        FROM pitches_raw raw
        JOIN pitch_features features
          ON features.pitch_uid = raw.pitch_uid
        WHERE raw.game_year IN ({season_sql})
          AND raw.catcher_id IS NOT NULL
          AND raw.pitch_type IS NOT NULL
          AND raw.delta_run_exp IS NOT NULL
          AND features.zone_bucket_25 IS NOT NULL
        ORDER BY raw.game_date, raw.game_pk, raw.at_bat_number, raw.pitch_number
        """,
        database_url,
    )
    if frame.empty:
        return frame

    integer_columns = [
        "game_pk",
        "game_year",
        "catcher_id",
        "pitcher",
        "batter",
        "pitcher_id",
        "batter_id",
    ]
    for column in integer_columns:
        frame[column] = pd.to_numeric(frame[column], errors="coerce").astype("Int64")
    return frame


def build_baseline_lookup(
    frame: pd.DataFrame,
    tier: ScoringTier,
    min_baseline_sample: int,
) -> pd.DataFrame:
    if frame.empty:
        return pd.DataFrame()

    baseline = (
        frame.groupby(tier.baseline_merge_columns, dropna=False)
        .agg(
            expected_rv=("delta_run_exp", "mean"),
            sample_size=("pitch_uid", "size"),
        )
        .reset_index()
    )
    return baseline[baseline["sample_size"] >= min_baseline_sample].copy()


def build_candidate_usage(
    frame: pd.DataFrame,
    tier: ScoringTier,
    min_candidate_count: int,
    min_candidate_prob: float,
) -> pd.DataFrame:
    if frame.empty:
        return pd.DataFrame()

    grouped = (
        frame.groupby([*tier.candidate_context_columns, *tier.option_columns], dropna=False)
        .agg(pitch_count=("pitch_uid", "size"))
        .reset_index()
    )
    if grouped.empty:
        return grouped

    grouped["candidate_prob"] = grouped["pitch_count"] / grouped.groupby(
        list(tier.candidate_context_columns),
        dropna=False,
    )["pitch_count"].transform("sum")
    grouped = grouped[
        (grouped["pitch_count"] >= min_candidate_count)
        & (grouped["candidate_prob"] >= min_candidate_prob)
    ].copy()
    if grouped.empty:
        return grouped

    grouped["candidate_prob"] = grouped["pitch_count"] / grouped.groupby(
        list(tier.candidate_context_columns),
        dropna=False,
    )["pitch_count"].transform("sum")
    return grouped


def score_tier(
    unresolved: pd.DataFrame,
    source_frame: pd.DataFrame,
    tier: ScoringTier,
    min_baseline_sample: int,
    min_candidate_count: int,
    min_candidate_prob: float,
) -> tuple[pd.DataFrame, Dict[str, int]]:
    baseline_lookup = build_baseline_lookup(source_frame, tier, min_baseline_sample)
    candidate_usage = build_candidate_usage(
        source_frame,
        tier,
        min_candidate_count=min_candidate_count,
        min_candidate_prob=min_candidate_prob,
    )
    metrics = {
        "baseline_rows": int(len(baseline_lookup)),
        "candidate_rows": int(len(candidate_usage)),
        "scored_rows": 0,
    }
    if unresolved.empty or baseline_lookup.empty or candidate_usage.empty:
        return pd.DataFrame(), metrics

    actual_lookup = baseline_lookup.rename(
        columns={
            "expected_rv": "expected_rv_actual",
            "sample_size": "actual_context_sample_size",
        }
    )
    actual_scored = unresolved.merge(
        actual_lookup,
        on=tier.baseline_merge_columns,
        how="inner",
    )
    if actual_scored.empty:
        return pd.DataFrame(), metrics

    candidate_lookup = candidate_usage.merge(
        baseline_lookup.rename(columns={"expected_rv": "candidate_expected_rv"}),
        on=tier.candidate_baseline_merge_columns,
        how="inner",
    )
    if candidate_lookup.empty:
        return pd.DataFrame(), metrics

    candidate_lookup["candidate_prob"] = candidate_lookup["candidate_prob"] / candidate_lookup.groupby(
        list(tier.candidate_context_columns),
        dropna=False,
    )["candidate_prob"].transform("sum")
    candidate_lookup["weighted_candidate_expected_rv"] = (
        candidate_lookup["candidate_prob"] * candidate_lookup["candidate_expected_rv"]
    )

    pitch_candidates = actual_scored[["pitch_uid", *tier.candidate_context_columns]].merge(
        candidate_lookup[
            [
                *tier.candidate_context_columns,
                "candidate_prob",
                "candidate_expected_rv",
                "weighted_candidate_expected_rv",
            ]
        ],
        on=list(tier.candidate_context_columns),
        how="left",
    )
    pitch_baselines = (
        pitch_candidates.dropna(subset=["candidate_expected_rv"])
        .groupby("pitch_uid", dropna=False)
        .agg(
            expected_rv_baseline=("weighted_candidate_expected_rv", "sum"),
            surviving_candidate_count=("candidate_expected_rv", "size"),
        )
        .reset_index()
    )
    if pitch_baselines.empty:
        return pd.DataFrame(), metrics

    scored = actual_scored.merge(pitch_baselines, on="pitch_uid", how="inner")
    if scored.empty:
        return pd.DataFrame(), metrics

    scored["dva"] = scored["expected_rv_baseline"] - scored["expected_rv_actual"]
    scored["execution_gap"] = scored["delta_run_exp"] - scored["expected_rv_actual"]
    scored["fallback_tier"] = tier.name
    scored["outperformed_baseline"] = scored["dva"] > 0
    scored["receiving_bonus"] = 0.0
    scored["final_pitch_score"] = scored["dva"]
    metrics["scored_rows"] = int(len(scored))
    return scored, metrics


def score_all_tiers(
    source_frame: pd.DataFrame,
    model_version: str,
    min_baseline_sample: int,
    min_candidate_count: int,
    min_candidate_prob: float,
) -> tuple[pd.DataFrame, Dict[str, Dict[str, int]]]:
    unresolved = source_frame.copy()
    scored_frames: List[pd.DataFrame] = []
    tier_metrics: Dict[str, Dict[str, int]] = {}

    for tier in SCORING_TIERS:
        scored_tier, metrics = score_tier(
            unresolved,
            source_frame,
            tier,
            min_baseline_sample=min_baseline_sample,
            min_candidate_count=min_candidate_count,
            min_candidate_prob=min_candidate_prob,
        )
        tier_metrics[tier.name] = metrics
        if scored_tier.empty:
            continue

        scored_frames.append(scored_tier)
        resolved_pitch_uids = set(scored_tier["pitch_uid"].tolist())
        unresolved = unresolved[~unresolved["pitch_uid"].isin(resolved_pitch_uids)].copy()

    if not scored_frames:
        return pd.DataFrame(), tier_metrics

    scored = pd.concat(scored_frames, ignore_index=True)
    scored["model_version"] = model_version
    scored = scored.sort_values(["game_date", "game_pk", "pitch_uid"])
    return scored, tier_metrics


def build_pitch_score_output(scored: pd.DataFrame) -> pd.DataFrame:
    if scored.empty:
        return scored

    output = scored[
        [
            "pitch_uid",
            "catcher_id",
            "pitcher",
            "batter",
            "pitcher_id",
            "batter_id",
            "game_pk",
            "game_date",
            "game_year",
            "expected_rv_actual",
            "expected_rv_baseline",
            "dva",
            "execution_gap",
            "actual_context_sample_size",
            "surviving_candidate_count",
            "fallback_tier",
            "outperformed_baseline",
            "receiving_bonus",
            "final_pitch_score",
            "model_version",
        ]
    ].copy()
    output["catcher_id"] = pd.to_numeric(output["catcher_id"], errors="coerce").astype("Int64")
    output["pitcher"] = pd.to_numeric(output["pitcher"], errors="coerce").astype("Int64")
    output["batter"] = pd.to_numeric(output["batter"], errors="coerce").astype("Int64")
    output["pitcher_id"] = pd.to_numeric(output["pitcher_id"], errors="coerce").astype("Int64")
    output["batter_id"] = pd.to_numeric(output["batter_id"], errors="coerce").astype("Int64")
    output["game_pk"] = pd.to_numeric(output["game_pk"], errors="coerce").astype("Int64")
    output["game_year"] = pd.to_numeric(output["game_year"], errors="coerce").astype("Int64")
    output["actual_context_sample_size"] = pd.to_numeric(
        output["actual_context_sample_size"],
        errors="coerce",
    ).astype("Int64")
    output["surviving_candidate_count"] = pd.to_numeric(
        output["surviving_candidate_count"],
        errors="coerce",
    ).astype("Int64")
    return output


def build_game_score_output(scored: pd.DataFrame) -> pd.DataFrame:
    if scored.empty:
        return pd.DataFrame()

    aggregated = (
        scored.groupby(["catcher_id", "game_pk", "game_date", "game_year"], dropna=False)
        .agg(
            pitches_scored=("pitch_uid", "size"),
            total_dva=("dva", "sum"),
            total_receiving_bonus=("receiving_bonus", "sum"),
            total_cdri=("final_pitch_score", "sum"),
            avg_execution_gap=("execution_gap", "mean"),
        )
        .reset_index()
    )
    return aggregated


def record_model_registry(
    scored: pd.DataFrame,
    database_url: str,
    model_version: str,
) -> None:
    if scored.empty:
        return

    trained_on_start = pd.to_datetime(scored["game_date"], errors="coerce").min()
    trained_on_end = pd.to_datetime(scored["game_date"], errors="coerce").max()
    execute_sql(
        """
        INSERT INTO model_registry (
            model_version,
            model_type,
            trained_on_start,
            trained_on_end,
            feature_list,
            notes
        )
        VALUES (
            :model_version,
            :model_type,
            :trained_on_start,
            :trained_on_end,
            NULL,
            :notes
        )
        ON CONFLICT (model_version) DO UPDATE SET
            model_type = EXCLUDED.model_type,
            trained_on_start = EXCLUDED.trained_on_start,
            trained_on_end = EXCLUDED.trained_on_end,
            notes = EXCLUDED.notes
        """,
        database_url,
        params={
            "model_version": model_version,
            "model_type": "contextual_baseline",
            "trained_on_start": trained_on_start.date() if pd.notna(trained_on_start) else None,
            "trained_on_end": trained_on_end.date() if pd.notna(trained_on_end) else None,
            "notes": (
                "Public-data DVA using contextual mean delta_run_exp, "
                "pitcher-specific candidate usage, and tiered count/location fallback."
            ),
        },
    )


def clear_existing_outputs(database_url: str, seasons: Sequence[int]) -> None:
    if not seasons:
        return

    season_sql = ", ".join(str(int(season)) for season in seasons)
    execute_sql(
        f"""
        DELETE FROM catcher_pitch_scores
        WHERE game_year IN ({season_sql})
        """,
        database_url,
    )
    execute_sql(
        f"""
        DELETE FROM catcher_game_scores
        WHERE game_year IN ({season_sql})
        """,
        database_url,
    )


def write_outputs(scored: pd.DataFrame, database_url: str, seasons: Sequence[int]) -> tuple[int, int]:
    clear_existing_outputs(database_url, seasons)
    pitch_scores = build_pitch_score_output(scored)
    game_scores = build_game_score_output(scored)
    pitch_rows = upsert_dataframe(
        pitch_scores,
        "catcher_pitch_scores",
        ["pitch_uid"],
        database_url,
    )
    game_rows = upsert_dataframe(
        game_scores,
        "catcher_game_scores",
        ["catcher_id", "game_pk"],
        database_url,
    )
    return pitch_rows, game_rows


def print_metrics(
    source_frame: pd.DataFrame,
    scored: pd.DataFrame,
    tier_metrics: Dict[str, Dict[str, int]],
    catcher_game_rows: int,
) -> None:
    total_baseline_rows = sum(metrics["baseline_rows"] for metrics in tier_metrics.values())
    dropped_sparse_context_pct = (
        1.0 - (len(scored) / len(source_frame))
        if len(source_frame) > 0
        else 0.0
    )
    single_candidate_pct = (
        float((scored["surviving_candidate_count"] == 1).mean())
        if not scored.empty
        else 0.0
    )

    print(f"Raw candidate pitches: {len(source_frame):,}")
    print(f"Baseline rows: {total_baseline_rows:,}")
    print(f"Scored pitches: {len(scored):,}")
    print(f"catcher_game_scores rows written: {catcher_game_rows:,}")
    print(f"Dropped sparse context pct: {dropped_sparse_context_pct:.2%}")
    print(f"Single-candidate context pct: {single_candidate_pct:.2%}")
    for tier_name, metrics in tier_metrics.items():
        print(
            f"  {tier_name}: baseline_rows={metrics['baseline_rows']:,}, "
            f"candidate_rows={metrics['candidate_rows']:,}, scored_rows={metrics['scored_rows']:,}"
        )


def main() -> None:
    args = parse_args()
    ensure_schema(args.db_url)

    seasons = resolve_seasons(args.db_url, args.season)
    source_frame = load_scoring_frame(args.db_url, seasons)
    if source_frame.empty:
        print("No eligible pitches found for scoring.")
        return

    scored, tier_metrics = score_all_tiers(
        source_frame,
        model_version=args.model_version,
        min_baseline_sample=args.min_baseline_sample,
        min_candidate_count=args.min_candidate_count,
        min_candidate_prob=args.min_candidate_prob,
    )
    if scored.empty:
        print(f"Raw candidate pitches: {len(source_frame):,}")
        print("Baseline rows: 0")
        print("Scored pitches: 0")
        print("catcher_game_scores rows written: 0")
        print("Dropped sparse context pct: 100.00%")
        print("Single-candidate context pct: 0.00%")
        return

    pitch_rows, game_rows = write_outputs(scored, args.db_url, seasons)
    record_model_registry(scored, args.db_url, args.model_version)
    print_metrics(source_frame, scored, tier_metrics, game_rows)
    if pitch_rows != len(scored):
        print(f"Pitch-level rows written: {pitch_rows:,}")


if __name__ == "__main__":
    main()
