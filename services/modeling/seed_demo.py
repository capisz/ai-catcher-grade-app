from __future__ import annotations

from pathlib import Path

from catcher_intel.candidate_sets import build_candidate_pitch_sets
from catcher_intel.config import get_settings
from catcher_intel.db import clear_table, ensure_schema, write_dataframe
from catcher_intel.demo import build_demo_pitch_frame
from catcher_intel.feature_engineering import derive_feature_frame
from catcher_intel.modeling import (
    build_batter_zone_profiles,
    build_catcher_game_scores,
    build_model_registry_frame,
    build_training_frame,
    save_model_artifacts,
    score_pitch_decisions,
    train_run_value_model,
)


def main() -> None:
    settings = get_settings()
    ensure_schema(settings.database_url)

    raw_frame = build_demo_pitch_frame()
    feature_frame = derive_feature_frame(raw_frame)
    candidate_frame = build_candidate_pitch_sets(raw_frame, feature_frame)
    training_frame = build_training_frame(raw_frame, feature_frame)
    artifacts = train_run_value_model(training_frame, candidate_frame)
    score_frame = score_pitch_decisions(raw_frame, feature_frame, artifacts)
    game_score_frame = build_catcher_game_scores(score_frame)
    batter_profiles = build_batter_zone_profiles(raw_frame, feature_frame)
    model_registry_frame = build_model_registry_frame(artifacts)

    for table_name in [
        "model_registry",
        "catcher_game_scores",
        "catcher_pitch_scores",
        "batter_zone_profiles",
        "pitcher_candidate_pitch_sets",
        "pitch_features",
        "pitches_raw",
    ]:
        clear_table(settings.database_url, table_name)

    write_dataframe(raw_frame, "pitches_raw", settings.database_url)
    write_dataframe(feature_frame, "pitch_features", settings.database_url)
    write_dataframe(candidate_frame, "pitcher_candidate_pitch_sets", settings.database_url)
    write_dataframe(score_frame, "catcher_pitch_scores", settings.database_url)
    write_dataframe(game_score_frame, "catcher_game_scores", settings.database_url)
    write_dataframe(batter_profiles, "batter_zone_profiles", settings.database_url)
    write_dataframe(model_registry_frame, "model_registry", settings.database_url)

    artifact_path = Path(settings.model_path)
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    save_model_artifacts(artifacts, artifact_path)

    print(
        f"Seeded demo data into {settings.database_url} and wrote model artifacts to {artifact_path}."
    )


if __name__ == "__main__":
    main()
