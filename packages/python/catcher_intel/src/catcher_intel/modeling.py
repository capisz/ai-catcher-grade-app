from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBRegressor

from catcher_intel.feature_engineering import model_feature_columns, pitch_type_group, zone_bucket_25_to_9

MODEL_VERSION = "xgb-delta-run-exp-v2"
TARGET_COLUMN = "delta_run_exp"
IDENTIFIER_COLUMNS = [
    "pitch_uid",
    "catcher_id",
    "pitcher",
    "batter",
    "game_pk",
    "game_date",
]
CATEGORICAL_COLUMNS = [
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
]
NUMERIC_COLUMNS = [
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
FEATURE_COLUMNS = list(model_feature_columns())


@dataclass
class ModelArtifacts:
    pipeline: Pipeline
    candidate_frame: pd.DataFrame
    metrics: Dict[str, float]
    trained_on_start: str
    trained_on_end: str
    model_version: str = MODEL_VERSION


def build_training_frame(raw_frame: pd.DataFrame, feature_frame: pd.DataFrame) -> pd.DataFrame:
    merged = raw_frame.merge(feature_frame, on="pitch_uid")
    merged = merged.dropna(subset=[TARGET_COLUMN, "pitch_type"])
    return merged[IDENTIFIER_COLUMNS + FEATURE_COLUMNS + [TARGET_COLUMN]]


def train_run_value_model(
    training_frame: pd.DataFrame, candidate_frame: pd.DataFrame
) -> ModelArtifacts:
    features = training_frame[FEATURE_COLUMNS].copy()
    target = training_frame[TARGET_COLUMN]

    preprocessor = ColumnTransformer(
        transformers=[
            (
                "categorical",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("encoder", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                CATEGORICAL_COLUMNS,
            ),
            ("numeric", SimpleImputer(strategy="median"), NUMERIC_COLUMNS),
        ]
    )

    model = XGBRegressor(
        n_estimators=260,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.85,
        objective="reg:squarederror",
        random_state=42,
    )
    pipeline = Pipeline([("preprocessor", preprocessor), ("model", model)])

    train_x, test_x, train_y, test_y = train_test_split(
        features, target, test_size=0.2, random_state=42
    )
    pipeline.fit(train_x, train_y)
    predictions = pipeline.predict(test_x)

    return ModelArtifacts(
        pipeline=pipeline,
        candidate_frame=candidate_frame,
        metrics={
            "mae": float(mean_absolute_error(test_y, predictions)),
            "r2": float(r2_score(test_y, predictions)),
        },
        trained_on_start=str(training_frame["game_date"].min()),
        trained_on_end=str(training_frame["game_date"].max()),
    )


def score_pitch_decisions(
    raw_frame: pd.DataFrame, feature_frame: pd.DataFrame, artifacts: ModelArtifacts
) -> pd.DataFrame:
    training_frame = build_training_frame(raw_frame, feature_frame)
    actual_predictions = artifacts.pipeline.predict(training_frame[FEATURE_COLUMNS])
    baseline_predictions = [
        _baseline_prediction(row, artifacts.pipeline, artifacts.candidate_frame)
        for _, row in training_frame.iterrows()
    ]

    scored = training_frame[IDENTIFIER_COLUMNS].copy()
    scored["expected_rv_actual"] = actual_predictions
    scored["expected_rv_baseline"] = baseline_predictions
    scored["dva"] = scored["expected_rv_baseline"] - scored["expected_rv_actual"]
    scored["execution_gap"] = training_frame[TARGET_COLUMN] - scored["expected_rv_actual"]
    scored["receiving_bonus"] = 0.0
    scored["final_pitch_score"] = scored["dva"] + scored["receiving_bonus"]
    scored["model_version"] = artifacts.model_version
    return scored


def build_catcher_game_scores(score_frame: pd.DataFrame) -> pd.DataFrame:
    return (
        score_frame.groupby(["catcher_id", "game_pk", "game_date"], dropna=False)
        .agg(
            pitches_scored=("pitch_uid", "size"),
            total_dva=("dva", "sum"),
            total_receiving_bonus=("receiving_bonus", "sum"),
            total_cdri=("final_pitch_score", "sum"),
            avg_execution_gap=("execution_gap", "mean"),
        )
        .reset_index()
    )


def build_batter_zone_profiles(
    raw_frame: pd.DataFrame, feature_frame: pd.DataFrame
) -> pd.DataFrame:
    merged = raw_frame.merge(feature_frame, on="pitch_uid")
    merged = merged[merged["zone_bucket_25"].notna()].copy()
    merged["pitch_type_group"] = merged["pitch_type"].apply(pitch_type_group)

    return (
        merged.groupby(
            [
                "batter",
                "game_year",
                "pitch_type_group",
                "p_throws",
                "count_bucket",
                "zone_bucket_25",
            ],
            dropna=False,
        )
        .agg(
            pitches_seen=("pitch_uid", "size"),
            avg_delta_run_exp=("delta_run_exp", "mean"),
            avg_estimated_woba=("estimated_woba_using_speedangle", "mean"),
        )
        .reset_index()
        .rename(columns={"game_year": "season", "p_throws": "pitcher_hand"})
    )


def build_model_registry_frame(artifacts: ModelArtifacts) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "model_version": artifacts.model_version,
                "model_type": "xgboost_regressor",
                "trained_on_start": artifacts.trained_on_start,
                "trained_on_end": artifacts.trained_on_end,
                "feature_list": json.dumps(FEATURE_COLUMNS),
                "notes": (
                    "First-pass delta_run_exp model without catcher fixed effects, "
                    "umpire effects, or leverage weighting."
                ),
            }
        ]
    )


def save_model_artifacts(artifacts: ModelArtifacts, artifact_path: Path) -> None:
    joblib.dump(artifacts, artifact_path)


def load_model_artifacts(artifact_path: Path) -> ModelArtifacts:
    return joblib.load(artifact_path)


def recommendation_frame_for_context(
    context: Dict[str, object], artifacts: ModelArtifacts
) -> pd.DataFrame:
    filtered = _filter_candidates(artifacts.candidate_frame, context)
    if filtered.empty:
        return pd.DataFrame()

    recommendation_rows: List[Dict[str, object]] = []
    for _, candidate in filtered.iterrows():
        row = dict(context)
        row.update(
            {
                "pitch_type": candidate["pitch_type"],
                "zone_bucket_25": candidate["zone_bucket_25"],
                "zone_bucket_9": zone_bucket_25_to_9(candidate["zone_bucket_25"]),
                "plate_x": candidate["target_plate_x"],
                "plate_z": candidate["target_plate_z"],
                "sz_top": candidate["sz_top"],
                "sz_bot": candidate["sz_bot"],
                "release_speed": candidate["release_speed"],
                "release_spin": candidate["release_spin"],
                "pfx_x": candidate["pfx_x"],
                "pfx_z": candidate["pfx_z"],
                "effective_speed": candidate["effective_speed"],
            }
        )
        recommendation_rows.append(row)

    recommendation_frame = pd.DataFrame(recommendation_rows)
    recommendation_frame["expected_rv"] = artifacts.pipeline.predict(
        recommendation_frame[FEATURE_COLUMNS]
    )
    recommendation_frame["usage_share"] = filtered["candidate_prob"].to_numpy()
    recommendation_frame["pitch_name"] = filtered["pitch_name"].to_numpy()
    recommendation_frame["pitch_type_group"] = filtered["pitch_type_group"].to_numpy()
    return recommendation_frame.sort_values("expected_rv")


def _baseline_prediction(
    row: pd.Series, pipeline: Pipeline, candidate_frame: pd.DataFrame
) -> float:
    filtered = _filter_candidates(candidate_frame, row.to_dict())
    if filtered.empty:
        return float(pipeline.predict(pd.DataFrame([row[FEATURE_COLUMNS].to_dict()]))[0])

    candidate_rows: List[Dict[str, object]] = []
    for _, candidate in filtered.iterrows():
        candidate_row = row[FEATURE_COLUMNS].to_dict()
        candidate_row.update(
            {
                "pitch_type": candidate["pitch_type"],
                "zone_bucket_25": candidate["zone_bucket_25"],
                "zone_bucket_9": zone_bucket_25_to_9(candidate["zone_bucket_25"]),
                "plate_x": candidate["target_plate_x"],
                "plate_z": candidate["target_plate_z"],
                "sz_top": candidate["sz_top"],
                "sz_bot": candidate["sz_bot"],
                "release_speed": candidate["release_speed"],
                "release_spin": candidate["release_spin"],
                "pfx_x": candidate["pfx_x"],
                "pfx_z": candidate["pfx_z"],
                "effective_speed": candidate["effective_speed"],
            }
        )
        candidate_rows.append(candidate_row)

    candidate_feature_frame = pd.DataFrame(candidate_rows)
    predictions = pipeline.predict(candidate_feature_frame[FEATURE_COLUMNS])
    return float(np.average(predictions, weights=filtered["candidate_prob"]))


def _filter_candidates(candidate_frame: pd.DataFrame, context: Dict[str, object]) -> pd.DataFrame:
    pitcher = context["pitcher"]
    filters = [
        ("count_bucket", context.get("count_bucket")),
        ("base_state", context.get("base_state")),
        ("outs_state", context.get("outs_state")),
        ("platoon_flag", context.get("platoon_flag")),
    ]

    filtered = candidate_frame[candidate_frame["pitcher"] == pitcher]
    if filtered.empty:
        return filtered

    for column, value in filters:
        subset = filtered[filtered[column] == value]
        if not subset.empty:
            filtered = subset
    return filtered
