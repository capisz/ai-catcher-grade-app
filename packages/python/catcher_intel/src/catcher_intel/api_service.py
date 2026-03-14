from __future__ import annotations

import json
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from catcher_intel.api_models import (
    CatcherDetailResponse,
    CatcherDiagnostics,
    CatcherGrades,
    CatcherIdentity,
    CatcherOption,
    CatchersResponse,
    CountSummary,
    CountsResponse,
    GradeValue,
    LeaderboardEntry,
    LeaderboardResponse,
    MatchupSummary,
    PairingSummary,
    PairingsResponse,
    PitchTypeSummary,
    PitchTypesResponse,
    PublicCatcherMetrics,
    RecommendationOption,
    RecommendationResponse,
)
from catcher_intel.config import get_settings
from catcher_intel.db import read_dataframe
from catcher_intel.feature_engineering import count_bucket_from_values
from catcher_intel.modeling import load_model_artifacts, recommendation_frame_for_context

LATEST_SCORED_SEASON_MIN_CATCHERS = 10
LATEST_SCORED_SEASON_MIN_TOTAL_PITCHES = 25000
GRADE_QUALIFIED_MIN_PITCHES = 500
GRADE_QUALIFIED_MIN_GAMES = 20


@lru_cache(maxsize=2)
def _cached_model_artifacts(model_path: str):
    return load_model_artifacts(Path(model_path))


class IntelService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def get_catchers(self, season: Optional[int] = None) -> CatchersResponse:
        resolved_season = self._resolve_season(season)
        frame = read_dataframe(
            """
            SELECT
                summary.catcher_id,
                COALESCE(identity.full_name, meta.full_name, 'Catcher ' || summary.catcher_id::text) AS catcher_name,
                COALESCE(meta.team_abbr, metrics.team_abbr, metrics.team_name) AS team,
                summary.season,
                COALESCE(
                    meta.dropdown_label,
                    COALESCE(identity.full_name, meta.full_name, 'Catcher ' || summary.catcher_id::text)
                        || ' | '
                        || COALESCE(meta.team_abbr, metrics.team_abbr, metrics.team_name, 'FA')
                        || ' | '
                        || summary.season::text
                ) AS dropdown_label,
                meta.headshot_url,
                meta.bats,
                meta.throws,
                COALESCE(meta.active, FALSE) AS active,
                identity.key_person,
                identity.key_uuid,
                identity.key_bbref,
                identity.key_fangraphs,
                identity.key_retro,
                summary.pitches
            FROM catcher_season_summary summary
            LEFT JOIN player_metadata meta
              ON meta.player_id = summary.catcher_id
             AND meta.season = summary.season
            LEFT JOIN player_identity identity
              ON identity.key_mlbam = summary.catcher_id
            LEFT JOIN catcher_public_metrics metrics
              ON metrics.catcher_id = summary.catcher_id
             AND metrics.season = summary.season
            WHERE summary.season = :season
            ORDER BY COALESCE(meta.active, FALSE) DESC, summary.pitches DESC, catcher_name ASC
            """,
            self.settings.database_url,
            params={"season": resolved_season},
        )

        return CatchersResponse(
            season=resolved_season,
            catchers=[
                CatcherOption(
                    catcher_id=int(row["catcher_id"]),
                    catcher_name=str(row["catcher_name"]),
                    team=self._optional_str(row.get("team")),
                    season=int(row["season"]),
                    dropdown_label=str(row["dropdown_label"]),
                    headshot_url=self._optional_str(row.get("headshot_url")),
                    bats=self._optional_str(row.get("bats")),
                    throws=self._optional_str(row.get("throws")),
                    active=bool(row.get("active", False)),
                    key_person=self._optional_str(row.get("key_person")),
                    key_uuid=self._optional_str(row.get("key_uuid")),
                    key_bbref=self._optional_str(row.get("key_bbref")),
                    key_fangraphs=self._optional_str(row.get("key_fangraphs")),
                    key_retro=self._optional_str(row.get("key_retro")),
                )
                for _, row in frame.iterrows()
            ],
        )

    def get_leaderboard(
        self,
        min_pitches: int = 50,
        season: Optional[int] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ) -> LeaderboardResponse:
        resolved_season = self._resolve_season(season)
        frame = read_dataframe(
            """
            WITH filtered AS (
                SELECT
                    catcher_id,
                    COUNT(*) AS pitches,
                    COUNT(DISTINCT game_pk) AS games_scored,
                    COALESCE(SUM(dva), 0) AS total_dva,
                    AVG(dva) AS avg_dva,
                    AVG(execution_gap) AS avg_execution_gap,
                    AVG(CASE WHEN outperformed_baseline THEN 1.0 ELSE 0.0 END) AS outperform_rate
                FROM catcher_pitch_scores
                WHERE catcher_id IS NOT NULL
                  AND game_year = :season
                  AND (:date_from IS NULL OR game_date >= :date_from)
                  AND (:date_to IS NULL OR game_date <= :date_to)
                GROUP BY catcher_id
                HAVING COUNT(*) >= :min_pitches
            )
            SELECT
                filtered.catcher_id,
                COALESCE(identity.full_name, meta.full_name, 'Catcher ' || filtered.catcher_id::text) AS catcher_name,
                COALESCE(meta.team_abbr, metrics.team_abbr, metrics.team_name) AS team,
                :season AS season,
                meta.headshot_url,
                identity.key_person,
                identity.key_bbref,
                identity.key_fangraphs,
                identity.key_retro,
                filtered.pitches,
                filtered.games_scored,
                filtered.total_dva,
                filtered.avg_dva,
                filtered.avg_execution_gap,
                summary.outperform_rate,
                grades.overall_game_calling_score,
                grades.overall_game_calling_label,
                grades.count_leverage_score,
                grades.count_leverage_label,
                grades.putaway_count_score,
                grades.putaway_count_label,
                grades.damage_avoidance_score,
                grades.damage_avoidance_label,
                grades.pitch_mix_synergy_score,
                grades.pitch_mix_synergy_label,
                grades.receiving_support_score,
                grades.receiving_support_label,
                metrics.framing_runs,
                metrics.blocking_runs,
                metrics.blocks_above_average,
                metrics.pop_time_2b,
                metrics.arm_overall,
                metrics.max_arm_strength,
                metrics.source_note,
                summary.fallback_context_pct,
                summary.avg_surviving_candidate_count,
                summary.single_candidate_pct,
                summary.dropped_sparse_context_pct
            FROM filtered
            LEFT JOIN player_metadata meta
              ON meta.player_id = filtered.catcher_id
             AND meta.season = :season
            LEFT JOIN player_identity identity
              ON identity.key_mlbam = filtered.catcher_id
            LEFT JOIN catcher_season_summary summary
              ON summary.catcher_id = filtered.catcher_id
             AND summary.season = :season
            LEFT JOIN catcher_grade_outputs grades
              ON grades.catcher_id = filtered.catcher_id
             AND grades.season = :season
            LEFT JOIN catcher_public_metrics metrics
              ON metrics.catcher_id = filtered.catcher_id
             AND metrics.season = :season
            ORDER BY filtered.total_dva DESC, filtered.avg_dva DESC, filtered.catcher_id ASC
            """,
            self.settings.database_url,
            params={
                "min_pitches": min_pitches,
                "season": resolved_season,
                "date_from": date_from,
                "date_to": date_to,
            },
        )
        return LeaderboardResponse(
            season=resolved_season,
            leaderboard=[
                LeaderboardEntry(
                    catcher_id=int(row["catcher_id"]),
                    catcher_name=str(row["catcher_name"]),
                    team=self._optional_str(row.get("team")),
                    season=resolved_season,
                    headshot_url=self._optional_str(row.get("headshot_url")),
                    key_person=self._optional_str(row.get("key_person")),
                    key_bbref=self._optional_str(row.get("key_bbref")),
                    key_fangraphs=self._optional_str(row.get("key_fangraphs")),
                    key_retro=self._optional_str(row.get("key_retro")),
                    pitches=int(row["pitches"]),
                    games_scored=self._optional_int(row.get("games_scored")) or 0,
                    total_dva=float(row["total_dva"]),
                    avg_dva=float(row["avg_dva"]),
                    avg_execution_gap=self._optional_float(row.get("avg_execution_gap")),
                    outperform_rate=self._optional_float(row.get("outperform_rate")),
                    qualified_for_grades=self._qualified_for_grades(
                        pitches=row.get("pitches"),
                        games_scored=row.get("games_scored"),
                    ),
                    stability_label=self._sample_quality(
                        pitches=row.get("pitches"),
                        games_scored=row.get("games_scored"),
                    )["label"],
                    stability_note=self._sample_quality(
                        pitches=row.get("pitches"),
                        games_scored=row.get("games_scored"),
                    )["note"],
                    grades=self._build_grades(row),
                    public_metrics=self._build_public_metrics(row),
                )
                for _, row in frame.iterrows()
            ],
        )

    def get_catcher_detail(
        self,
        catcher_id: int,
        season: Optional[int] = None,
    ) -> CatcherDetailResponse:
        resolved_season = self._resolve_season(season)
        summary = read_dataframe(
            """
            SELECT
                summary.catcher_id,
                summary.season,
                summary.pitches AS total_pitches,
                summary.games_scored,
                summary.total_dva,
                summary.avg_dva,
                summary.avg_execution_gap,
                summary.avg_expected_rv_actual,
                summary.outperform_rate,
                summary.avg_surviving_candidate_count,
                summary.single_candidate_pct,
                summary.dropped_sparse_context_pct,
                summary.fallback_context_pct,
                summary.model_version,
                COALESCE(identity.full_name, meta.full_name, 'Catcher ' || summary.catcher_id::text) AS catcher_name,
                COALESCE(meta.team_abbr, metrics.team_abbr, metrics.team_name) AS team,
                meta.headshot_url,
                meta.bats,
                meta.throws,
                COALESCE(meta.active, FALSE) AS active,
                meta.dropdown_label,
                identity.key_person,
                identity.key_uuid,
                identity.key_bbref,
                identity.key_fangraphs,
                identity.key_retro,
                grades.overall_game_calling_score,
                grades.overall_game_calling_label,
                grades.count_leverage_score,
                grades.count_leverage_label,
                grades.putaway_count_score,
                grades.putaway_count_label,
                grades.damage_avoidance_score,
                grades.damage_avoidance_label,
                grades.pitch_mix_synergy_score,
                grades.pitch_mix_synergy_label,
                grades.receiving_support_score,
                grades.receiving_support_label,
                grades.formula_notes,
                metrics.framing_runs,
                metrics.blocking_runs,
                metrics.blocks_above_average,
                metrics.pop_time_2b,
                metrics.arm_overall,
                metrics.max_arm_strength,
                metrics.source_note
            FROM catcher_season_summary summary
            LEFT JOIN player_metadata meta
              ON meta.player_id = summary.catcher_id
             AND meta.season = summary.season
            LEFT JOIN player_identity identity
              ON identity.key_mlbam = summary.catcher_id
            LEFT JOIN catcher_grade_outputs grades
              ON grades.catcher_id = summary.catcher_id
             AND grades.season = summary.season
            LEFT JOIN catcher_public_metrics metrics
              ON metrics.catcher_id = summary.catcher_id
             AND metrics.season = summary.season
            WHERE summary.catcher_id = :catcher_id
              AND summary.season = :season
            """,
            self.settings.database_url,
            params={"catcher_id": catcher_id, "season": resolved_season},
        )
        if summary.empty:
            raise LookupError(
                f"No catcher summary found for catcher_id={catcher_id} in season {resolved_season}"
            )

        summary_row = summary.iloc[0]
        formula_notes = self._parse_formula_notes(summary_row.get("formula_notes"))
        sample_quality = self._sample_quality(
            pitches=summary_row.get("total_pitches"),
            games_scored=summary_row.get("games_scored"),
        )
        count_state_summaries, count_bucket_summaries = self._get_count_summaries(
            catcher_id=catcher_id,
            season=resolved_season,
        )
        pitch_type_summaries = self._get_pitch_type_summaries(catcher_id, resolved_season)
        pairings = self._get_pairings(catcher_id, resolved_season)
        matchup_summaries = self._get_matchup_summaries(catcher_id, resolved_season)

        return CatcherDetailResponse(
            identity=self._build_identity(summary_row, catcher_id, resolved_season),
            total_pitches=int(summary_row["total_pitches"]),
            total_dva=float(summary_row["total_dva"]),
            avg_dva=float(summary_row["avg_dva"]),
            avg_execution_gap=self._optional_float(summary_row.get("avg_execution_gap")),
            grades=self._build_grades(summary_row, formula_notes=formula_notes),
            public_metrics=self._build_public_metrics(summary_row),
            diagnostics=CatcherDiagnostics(
                games_scored=self._optional_int(summary_row.get("games_scored")) or 0,
                avg_expected_rv_actual=self._optional_float(
                    summary_row.get("avg_expected_rv_actual")
                ),
                outperform_rate=self._optional_float(summary_row.get("outperform_rate")),
                avg_surviving_candidate_count=self._optional_float(
                    summary_row.get("avg_surviving_candidate_count")
                ),
                single_candidate_pct=self._optional_float(summary_row.get("single_candidate_pct")),
                dropped_sparse_context_pct=self._optional_float(
                    summary_row.get("dropped_sparse_context_pct")
                ),
                fallback_context_pct=self._optional_float(summary_row.get("fallback_context_pct")),
                qualified_for_grades=self._qualified_for_grades(
                    pitches=summary_row.get("total_pitches"),
                    games_scored=summary_row.get("games_scored"),
                ),
                stability_label=str(sample_quality["label"]),
                stability_note=str(sample_quality["note"]),
                model_version=self._optional_str(summary_row.get("model_version")),
            ),
            grade_formula_notes=formula_notes,
            count_state_summaries=count_state_summaries,
            count_bucket_summaries=count_bucket_summaries,
            pitch_type_summaries=pitch_type_summaries,
            pairings=pairings,
            matchup_summaries=matchup_summaries,
        )

    def get_catcher_pairings(
        self,
        catcher_id: int,
        season: Optional[int] = None,
        limit: int = 10,
    ) -> PairingsResponse:
        resolved_season = self._resolve_season(season)
        return PairingsResponse(
            catcher_id=catcher_id,
            season=resolved_season,
            pairings=self._get_pairings(catcher_id, resolved_season, limit=limit),
        )

    def get_catcher_counts(
        self,
        catcher_id: int,
        season: Optional[int] = None,
    ) -> CountsResponse:
        resolved_season = self._resolve_season(season)
        count_state_summaries, count_bucket_summaries = self._get_count_summaries(
            catcher_id=catcher_id,
            season=resolved_season,
        )
        return CountsResponse(
            catcher_id=catcher_id,
            season=resolved_season,
            count_state_summaries=count_state_summaries,
            count_bucket_summaries=count_bucket_summaries,
        )

    def get_catcher_pitch_types(
        self,
        catcher_id: int,
        season: Optional[int] = None,
    ) -> PitchTypesResponse:
        resolved_season = self._resolve_season(season)
        return PitchTypesResponse(
            catcher_id=catcher_id,
            season=resolved_season,
            pitch_types=self._get_pitch_type_summaries(catcher_id, resolved_season),
        )

    def get_atbat_recommendation(
        self,
        pitcher_id: int,
        stand: str,
        p_throws: str,
        balls: int,
        strikes: int,
        outs_when_up: int,
        base_state: str = "000",
        catcher_id: Optional[int] = None,
        batter_id: Optional[int] = None,
        prev_pitch_type_1: Optional[str] = None,
        prev_pitch_type_2: Optional[str] = None,
    ) -> RecommendationResponse:
        artifacts = _cached_model_artifacts(self.settings.model_path)
        base_state_value = self._normalized_base_state(base_state)
        stand_value = stand.upper()
        p_throws_value = p_throws.upper()
        context = {
            "pitcher": pitcher_id,
            "batter": batter_id or 0,
            "stand": stand_value,
            "p_throws": p_throws_value,
            "count_state": f"{balls}-{strikes}",
            "count_bucket": count_bucket_from_values(balls, strikes),
            "base_state": base_state_value,
            "outs_state": str(outs_when_up),
            "platoon_flag": "same_side"
            if stand_value == p_throws_value
            else "opposite_side",
            "prev_pitch_type_1": (prev_pitch_type_1 or "NONE").upper(),
            "prev_pitch_type_2": (prev_pitch_type_2 or "NONE").upper(),
        }
        recommendation_frame = recommendation_frame_for_context(context, artifacts)
        if recommendation_frame.empty:
            raise LookupError(
                f"No recommendation candidates found for pitcher_id={pitcher_id} in context "
                f"{context['count_state']} {base_state_value} outs={outs_when_up}."
            )

        weighted_expected_rv = None
        if recommendation_frame["usage_share"].sum() > 0:
            weighted_expected_rv = float(
                np.average(
                    recommendation_frame["expected_rv"],
                    weights=recommendation_frame["usage_share"],
                )
            )

        return RecommendationResponse(
            catcher_id=catcher_id,
            pitcher_id=pitcher_id,
            batter_id=batter_id,
            stand=stand_value,
            p_throws=p_throws_value,
            count_state=str(context["count_state"]),
            count_bucket=str(context["count_bucket"]),
            base_state=base_state_value,
            outs_state=str(context["outs_state"]),
            platoon_flag=str(context["platoon_flag"]),
            candidate_count=int(len(recommendation_frame)),
            weighted_expected_rv=weighted_expected_rv,
            model_version=artifacts.model_version,
            note=(
                "Observed public-data recommendation using pitcher-specific historical candidates. "
                "This does not claim private PitchCom or hidden sign-call intent."
            ),
            options=[
                RecommendationOption(
                    pitch_type=str(row["pitch_type"]),
                    pitch_name=self._optional_str(row.get("pitch_name")),
                    pitch_type_group=self._optional_str(row.get("pitch_type_group")),
                    expected_rv=float(row["expected_rv"]),
                    usage_share=float(row["usage_share"]),
                    zone_bucket_25=self._optional_str(row.get("zone_bucket_25")),
                    zone_bucket_9=self._optional_str(row.get("zone_bucket_9")),
                    target_plate_x=self._optional_float(row.get("plate_x")),
                    target_plate_z=self._optional_float(row.get("plate_z")),
                )
                for _, row in recommendation_frame.iterrows()
            ],
        )

    def _resolve_season(self, season: Optional[int]) -> int:
        if season is not None:
            return season

        frame = read_dataframe(
            """
            WITH season_rollup AS (
                SELECT
                    season,
                    COUNT(*) AS catcher_rows,
                    COALESCE(SUM(pitches), 0) AS total_pitches
                FROM catcher_season_summary
                GROUP BY season
            )
            SELECT COALESCE(
                (
                    SELECT MAX(season)
                    FROM season_rollup
                    WHERE catcher_rows >= :min_catchers
                      AND total_pitches >= :min_total_pitches
                ),
                (SELECT MAX(season) FROM catcher_season_summary),
                (SELECT MAX(game_year) FROM catcher_pitch_scores),
                (SELECT MAX(game_year) FROM pitches_raw)
            ) AS season
            """,
            self.settings.database_url,
            params={
                "min_catchers": LATEST_SCORED_SEASON_MIN_CATCHERS,
                "min_total_pitches": LATEST_SCORED_SEASON_MIN_TOTAL_PITCHES,
            },
        )
        if frame.empty or pd.isna(frame.iloc[0]["season"]):
            return date.today().year
        return int(frame.iloc[0]["season"])

    def _get_count_summaries(
        self,
        catcher_id: int,
        season: int,
    ) -> tuple[list[CountSummary], list[CountSummary]]:
        frame = read_dataframe(
            """
            SELECT *
            FROM catcher_count_summaries
            WHERE catcher_id = :catcher_id
              AND season = :season
            """,
            self.settings.database_url,
            params={"catcher_id": catcher_id, "season": season},
        )
        if frame.empty:
            return [], []

        count_state_frame = frame[frame["split_type"] == "count_state"].copy()
        count_bucket_frame = frame[frame["split_type"] == "count_bucket"].copy()
        count_state_frame["sort_key"] = count_state_frame["split_value"].map(self._count_sort_key)
        count_bucket_order = {
            "pitcher_ahead": 0,
            "even": 1,
            "hitter_ahead": 2,
            "full_count": 3,
        }
        count_bucket_frame["sort_key"] = count_bucket_frame["split_value"].map(
            lambda value: count_bucket_order.get(str(value), 99)
        )

        return (
            [self._build_count_summary(row) for _, row in count_state_frame.sort_values("sort_key").iterrows()],
            [self._build_count_summary(row) for _, row in count_bucket_frame.sort_values("sort_key").iterrows()],
        )

    def _get_pitch_type_summaries(self, catcher_id: int, season: int) -> list[PitchTypeSummary]:
        frame = read_dataframe(
            """
            SELECT *
            FROM catcher_pitch_type_summaries
            WHERE catcher_id = :catcher_id
              AND season = :season
            ORDER BY pitches DESC, avg_dva DESC, pitch_type ASC
            """,
            self.settings.database_url,
            params={"catcher_id": catcher_id, "season": season},
        )
        return [self._build_pitch_type_summary(row) for _, row in frame.iterrows()]

    def _get_pairings(
        self,
        catcher_id: int,
        season: int,
        limit: int = 10,
    ) -> list[PairingSummary]:
        frame = read_dataframe(
            """
            SELECT
                pairings.pitcher_id,
                COALESCE(identity.full_name, meta.full_name, 'Pitcher ' || pairings.pitcher_id::text) AS pitcher_name,
                pairings.pitches,
                pairings.total_dva,
                pairings.avg_dva,
                pairings.avg_execution_gap,
                pairings.avg_expected_rv_actual,
                pairings.outperform_rate
            FROM catcher_pairing_summaries pairings
            LEFT JOIN player_metadata meta
              ON meta.player_id = pairings.pitcher_id
             AND meta.season = pairings.season
            LEFT JOIN player_identity identity
              ON identity.key_mlbam = pairings.pitcher_id
            WHERE pairings.catcher_id = :catcher_id
              AND pairings.season = :season
            ORDER BY pairings.pitches DESC, pairings.avg_dva DESC, pairings.pitcher_id ASC
            LIMIT :limit
            """,
            self.settings.database_url,
            params={"catcher_id": catcher_id, "season": season, "limit": limit},
        )
        return [self._build_pairing_summary(row) for _, row in frame.iterrows()]

    def _get_matchup_summaries(self, catcher_id: int, season: int) -> list[MatchupSummary]:
        frame = read_dataframe(
            """
            SELECT
                stand,
                p_throws,
                matchup_label,
                pitches,
                total_dva,
                avg_dva,
                avg_execution_gap,
                outperform_rate
            FROM catcher_matchup_summaries
            WHERE catcher_id = :catcher_id
              AND season = :season
            ORDER BY pitches DESC, matchup_label ASC
            """,
            self.settings.database_url,
            params={"catcher_id": catcher_id, "season": season},
        )
        return [
            MatchupSummary(
                stand=str(row["stand"]),
                p_throws=str(row["p_throws"]),
                matchup_label=str(row["matchup_label"]),
                pitches=int(row["pitches"]),
                total_dva=float(row["total_dva"]),
                avg_dva=float(row["avg_dva"]),
                avg_execution_gap=self._optional_float(row.get("avg_execution_gap")),
                outperform_rate=self._optional_float(row.get("outperform_rate")),
            )
            for _, row in frame.iterrows()
        ]

    def _build_grades(
        self,
        row: pd.Series,
        formula_notes: Optional[dict[str, dict[str, object]]] = None,
    ) -> CatcherGrades:
        return CatcherGrades(
            overall_game_calling=self._grade_value(
                row,
                "overall_game_calling",
                note=(formula_notes or {}).get("overall_game_calling"),
            ),
            count_leverage=self._grade_value(
                row,
                "count_leverage",
                note=(formula_notes or {}).get("count_leverage"),
            ),
            putaway_count=self._grade_value(
                row,
                "putaway_count",
                note=(formula_notes or {}).get("putaway_count"),
            ),
            damage_avoidance=self._grade_value(
                row,
                "damage_avoidance",
                note=(formula_notes or {}).get("damage_avoidance"),
            ),
            pitch_mix_synergy=self._grade_value(
                row,
                "pitch_mix_synergy",
                note=(formula_notes or {}).get("pitch_mix_synergy"),
            ),
            receiving_support=self._grade_value(
                row,
                "receiving_support",
                note=(formula_notes or {}).get("receiving_support"),
            ),
        )

    def _build_public_metrics(self, row: pd.Series) -> PublicCatcherMetrics:
        return PublicCatcherMetrics(
            framing_runs=self._optional_float(row.get("framing_runs")),
            blocking_runs=self._optional_float(row.get("blocking_runs")),
            blocks_above_average=self._optional_float(row.get("blocks_above_average")),
            pop_time_2b=self._optional_float(row.get("pop_time_2b")),
            arm_overall=self._optional_float(row.get("arm_overall")),
            max_arm_strength=self._optional_float(row.get("max_arm_strength")),
            source_note=self._optional_str(row.get("source_note")),
        )

    def _build_identity(self, row: pd.Series, catcher_id: int, season: int) -> CatcherIdentity:
        return CatcherIdentity(
            catcher_id=catcher_id,
            catcher_name=str(row["catcher_name"]),
            team=self._optional_str(row.get("team")),
            season=season,
            headshot_url=self._optional_str(row.get("headshot_url")),
            bats=self._optional_str(row.get("bats")),
            throws=self._optional_str(row.get("throws")),
            active=bool(row.get("active", False)),
            dropdown_label=self._optional_str(row.get("dropdown_label")),
            key_person=self._optional_str(row.get("key_person")),
            key_uuid=self._optional_str(row.get("key_uuid")),
            key_bbref=self._optional_str(row.get("key_bbref")),
            key_fangraphs=self._optional_str(row.get("key_fangraphs")),
            key_retro=self._optional_str(row.get("key_retro")),
        )

    def _build_count_summary(self, row: pd.Series) -> CountSummary:
        return CountSummary(
            split_type=str(row["split_type"]),
            split_value=str(row["split_value"]),
            pitches=int(row["pitches"]),
            total_dva=float(row["total_dva"]),
            avg_dva=float(row["avg_dva"]),
            avg_execution_gap=self._optional_float(row.get("avg_execution_gap")),
            avg_expected_rv_actual=self._optional_float(row.get("avg_expected_rv_actual")),
            outperform_rate=self._optional_float(row.get("outperform_rate")),
            fastball_rate=self._optional_float(row.get("fastball_rate")),
            breaker_rate=self._optional_float(row.get("breaker_rate")),
            offspeed_rate=self._optional_float(row.get("offspeed_rate")),
            fastball_dva=self._optional_float(row.get("fastball_dva")),
            breaker_dva=self._optional_float(row.get("breaker_dva")),
            offspeed_dva=self._optional_float(row.get("offspeed_dva")),
            actual_top_pitch_family=self._optional_str(row.get("actual_top_pitch_family")),
            recommended_pitch_family=self._optional_str(row.get("recommended_pitch_family")),
            hitter_friendly_flag=bool(row.get("hitter_friendly_flag", False)),
            pitcher_friendly_flag=bool(row.get("pitcher_friendly_flag", False)),
            putaway_flag=bool(row.get("putaway_flag", False)),
        )

    def _build_pitch_type_summary(self, row: pd.Series) -> PitchTypeSummary:
        return PitchTypeSummary(
            pitch_type=str(row["pitch_type"]),
            pitch_family=self._optional_str(row.get("pitch_family")),
            pitches=int(row["pitches"]),
            total_dva=float(row["total_dva"]),
            avg_dva=float(row["avg_dva"]),
            avg_execution_gap=self._optional_float(row.get("avg_execution_gap")),
            avg_expected_rv_actual=self._optional_float(row.get("avg_expected_rv_actual")),
            outperform_rate=self._optional_float(row.get("outperform_rate")),
        )

    def _build_pairing_summary(self, row: pd.Series) -> PairingSummary:
        return PairingSummary(
            pitcher_id=int(row["pitcher_id"]),
            pitcher_name=str(row["pitcher_name"]),
            pitches=int(row["pitches"]),
            total_dva=float(row["total_dva"]),
            avg_dva=float(row["avg_dva"]),
            avg_execution_gap=self._optional_float(row.get("avg_execution_gap")),
            avg_expected_rv_actual=self._optional_float(row.get("avg_expected_rv_actual")),
            outperform_rate=self._optional_float(row.get("outperform_rate")),
        )

    def _grade_value(
        self,
        row: pd.Series,
        prefix: str,
        note: Optional[dict[str, object]] = None,
    ) -> GradeValue:
        return GradeValue(
            score=self._optional_float(row.get(f"{prefix}_score")),
            label=self._optional_str(row.get(f"{prefix}_label")),
            qualified=bool((note or {}).get("qualified", False)),
            population_size=self._optional_int((note or {}).get("population_size")),
            stability_note=self._optional_str((note or {}).get("stability_note")),
        )

    def _parse_formula_notes(self, value: object) -> dict[str, dict[str, object]]:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return {}
        try:
            parsed = json.loads(str(value))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            return {}
        return {}

    def _optional_float(self, value: object) -> Optional[float]:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return None
        if np.isnan(numeric):
            return None
        return numeric

    def _optional_int(self, value: object) -> Optional[int]:
        numeric = self._optional_float(value)
        if numeric is None:
            return None
        return int(round(numeric))

    def _optional_str(self, value: object) -> Optional[str]:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None
        text = str(value).strip()
        return text or None

    def _normalized_base_state(self, value: object) -> str:
        text = (self._optional_str(value) or "000").replace("-", "").replace(" ", "")
        if len(text) != 3 or any(character not in {"0", "1"} for character in text):
            return "000"
        return text

    def _qualified_for_grades(self, pitches: object, games_scored: object) -> bool:
        pitch_count = self._optional_int(pitches) or 0
        games = self._optional_int(games_scored) or 0
        return pitch_count >= GRADE_QUALIFIED_MIN_PITCHES and games >= GRADE_QUALIFIED_MIN_GAMES

    def _sample_quality(self, pitches: object, games_scored: object) -> dict[str, str]:
        pitch_count = self._optional_int(pitches) or 0
        games = self._optional_int(games_scored) or 0
        if pitch_count >= 1500 and games >= 45:
            return {
                "label": "High stability",
                "note": f"{pitch_count:,} pitches across {games} games. Strong season sample.",
            }
        if pitch_count >= 800 and games >= 25:
            return {
                "label": "Stable",
                "note": f"{pitch_count:,} pitches across {games} games. Season-level outputs are reasonably stable.",
            }
        if pitch_count >= 300 and games >= 10:
            return {
                "label": "Limited sample",
                "note": f"{pitch_count:,} pitches across {games} games. Use split-level outputs carefully.",
            }
        return {
            "label": "Low sample",
            "note": f"{pitch_count:,} pitches across {games} games. Treat grades and split tables as unstable.",
        }

    def _count_sort_key(self, value: object) -> tuple[int, int]:
        text = str(value)
        if "-" not in text:
            return (99, 99)
        balls_text, strikes_text = text.split("-", 1)
        try:
            return (int(balls_text), int(strikes_text))
        except ValueError:
            return (99, 99)
