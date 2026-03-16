from __future__ import annotations

import json
from datetime import datetime, timezone
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from catcher_intel.api_models import (
    AppMetadataResponse,
    CatcherComparisonFilters,
    CatcherComparisonResponse,
    CatcherDetailResponse,
    CatcherDiagnostics,
    CatcherGrades,
    CatcherIdentity,
    CatcherOption,
    CatcherReportOptionsResponse,
    CatcherReportRequest,
    CatcherSummaryInsight,
    CatchersResponse,
    CountSummary,
    CountsResponse,
    GradeValue,
    LeaderboardEntry,
    LeaderboardResponse,
    LocationSummaryCell,
    LocationSummaryResponse,
    MatchupSummary,
    PairingSummary,
    PairingsResponse,
    PitchTypeSummary,
    PitchTypesResponse,
    PublicCatcherMetrics,
    ReportFormatOption,
    ReportSectionOption,
    RecommendationOption,
    RecommendationResponse,
    TeamFilterOption,
)
from catcher_intel.config import get_settings
from catcher_intel.db import read_dataframe
from catcher_intel.feature_engineering import (
    count_bucket_from_values,
    pitch_type_group,
    zone_bucket_to_display,
)
from catcher_intel.grading import build_grade_outputs
from catcher_intel.modeling import load_model_artifacts, recommendation_frame_for_context
from catcher_intel.reporting import (
    REPORT_FORMAT_DEFINITIONS,
    REPORT_SECTION_DEFINITIONS,
    REPORT_SECTIONS_ORDER,
    GeneratedReport,
    build_csv_report,
    build_json_report,
    build_report_filename_base,
    normalize_report_sections,
)
from catcher_intel.summaries import (
    build_count_summaries,
    build_matchup_summaries,
    build_pairing_summaries,
    build_pitch_type_summaries,
    build_season_summary,
)

LATEST_SCORED_SEASON_MIN_CATCHERS = 10
LATEST_SCORED_SEASON_MIN_TOTAL_PITCHES = 25000
GRADE_QUALIFIED_MIN_PITCHES = 500
GRADE_QUALIFIED_MIN_GAMES = 20
COUNT_SPLIT_LOW_SAMPLE_MAX = 24
COUNT_SPLIT_STABLE_MIN = 60
COUNT_STATE_INSIGHT_MIN_PITCHES = 18
PITCH_TYPE_INSIGHT_MIN_PITCHES = 25
PAIRING_INSIGHT_MIN_PITCHES = 45


@lru_cache(maxsize=2)
def _cached_model_artifacts(model_path: str):
    return load_model_artifacts(Path(model_path))


class IntelService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def get_catchers(
        self,
        season: Optional[int] = None,
        team: Optional[str] = None,
    ) -> CatchersResponse:
        resolved_season = self._resolve_season(season)
        normalized_team = self._normalized_team_filter(team)
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
              AND (:team IS NULL OR COALESCE(meta.team_abbr, metrics.team_abbr, metrics.team_name) = :team)
            ORDER BY COALESCE(meta.active, FALSE) DESC, summary.pitches DESC, catcher_name ASC
            """,
            self.settings.database_url,
            params={"season": resolved_season, "team": normalized_team},
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

    def get_catcher_report_options(
        self,
        catcher_id: int,
        season: Optional[int] = None,
    ) -> CatcherReportOptionsResponse:
        detail = self.get_catcher_detail(catcher_id=catcher_id, season=season)
        available_seasons = self._get_available_catcher_seasons(catcher_id)
        available_sections = self._build_report_sections(detail)

        return CatcherReportOptionsResponse(
            catcher_id=detail.identity.catcher_id,
            catcher_name=detail.identity.catcher_name,
            selected_season=detail.identity.season,
            available_seasons=available_seasons,
            formats=[
                ReportFormatOption(key=key, **definition)
                for key, definition in REPORT_FORMAT_DEFINITIONS.items()
            ],
            sections=available_sections,
            supports_date_range=False,
            supports_min_pitches=True,
            default_min_pitches=20,
        )

    def generate_catcher_report(
        self,
        catcher_id: int,
        request: CatcherReportRequest,
    ) -> GeneratedReport:
        if request.format == "pdf":
            raise ValueError("PDF report export is not implemented yet. Use CSV or JSON for now.")
        if request.date_from or request.date_to:
            raise ValueError(
                "Date-range report filters are not implemented yet. Generate a full-season report instead."
            )

        detail = self.get_catcher_detail(catcher_id=catcher_id, season=request.season)
        included_sections = normalize_report_sections(request.included_sections)
        payload = self._build_catcher_report_payload(
            detail=detail,
            included_sections=included_sections,
            min_pitches=request.min_pitches,
            export_format=request.format,
        )
        filename_base = build_report_filename_base(
            detail.identity.catcher_name,
            detail.identity.season,
        )

        if request.format == "json":
            return build_json_report(payload, filename_base)
        return build_csv_report(payload, included_sections, filename_base)

    def get_leaderboard(
        self,
        min_pitches: int = 50,
        season: Optional[int] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        team: Optional[str] = None,
    ) -> LeaderboardResponse:
        resolved_season = self._resolve_season(season)
        normalized_team = self._normalized_team_filter(team)
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
            WHERE (:team IS NULL OR COALESCE(meta.team_abbr, metrics.team_abbr, metrics.team_name) = :team)
            ORDER BY filtered.total_dva DESC, filtered.avg_dva DESC, filtered.catcher_id ASC
            """,
            self.settings.database_url,
            params={
                "min_pitches": min_pitches,
                "season": resolved_season,
                "date_from": date_from,
                "date_to": date_to,
                "team": normalized_team,
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
        grades = self._build_grades(summary_row, formula_notes=formula_notes)
        diagnostics = CatcherDiagnostics(
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
        )
        summary_insights = self._build_summary_insights(
            catcher_name=str(summary_row.get("catcher_name") or f"Catcher {catcher_id}"),
            total_pitches=int(summary_row["total_pitches"]),
            total_dva=float(summary_row["total_dva"]),
            avg_dva=float(summary_row["avg_dva"]),
            avg_execution_gap=self._optional_float(summary_row.get("avg_execution_gap")),
            grades=grades,
            diagnostics=diagnostics,
            count_state_summaries=count_state_summaries,
            count_bucket_summaries=count_bucket_summaries,
            pitch_type_summaries=pitch_type_summaries,
            pairings=pairings,
        )

        return CatcherDetailResponse(
            identity=self._build_identity(summary_row, catcher_id, resolved_season),
            total_pitches=int(summary_row["total_pitches"]),
            total_dva=float(summary_row["total_dva"]),
            avg_dva=float(summary_row["avg_dva"]),
            avg_execution_gap=self._optional_float(summary_row.get("avg_execution_gap")),
            grades=grades,
            public_metrics=self._build_public_metrics(summary_row),
            diagnostics=diagnostics,
            grade_formula_notes=formula_notes,
            summary_insights=summary_insights,
            count_state_summaries=count_state_summaries,
            count_bucket_summaries=count_bucket_summaries,
            pitch_type_summaries=pitch_type_summaries,
            pairings=pairings,
            matchup_summaries=matchup_summaries,
        )

    def get_catcher_comparison(
        self,
        catcher_a_id: int,
        catcher_b_id: int,
        season: Optional[int] = None,
        min_pitches: int = 50,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        team: Optional[str] = None,
    ) -> CatcherComparisonResponse:
        if catcher_a_id == catcher_b_id:
            raise ValueError("Comparison mode requires two distinct catcher IDs.")
        if date_from and date_to and date_from > date_to:
            raise ValueError("date_from cannot be later than date_to.")

        resolved_season = self._resolve_season(season)
        normalized_team = self._normalized_team_filter(team)

        eligible_frame = self._load_filtered_eligible_pitch_frame(
            season=resolved_season,
            date_from=date_from,
            date_to=date_to,
            team=normalized_team,
        )
        scored_frame = self._load_filtered_scored_pitch_frame(
            season=resolved_season,
            date_from=date_from,
            date_to=date_to,
            team=normalized_team,
        )
        if scored_frame.empty:
            raise LookupError(
                f"No scored catcher pitch rows found for season {resolved_season}"
                + (
                    f" and team {normalized_team}"
                    if normalized_team
                    else ""
                )
                + "."
            )

        model_version = self._resolve_filtered_model_version(scored_frame, resolved_season)
        count_summaries_frame = build_count_summaries(scored_frame)
        pitch_type_summaries_frame = build_pitch_type_summaries(scored_frame)
        pairing_summaries_frame = build_pairing_summaries(scored_frame)
        matchup_summaries_frame = build_matchup_summaries(scored_frame)
        season_summary_frame = build_season_summary(
            scored_frame,
            eligible_frame,
            count_summaries_frame,
            pairing_summaries_frame,
            model_version or "dva_v1_contextual",
        )
        if season_summary_frame.empty:
            raise LookupError(
                f"No catcher comparison summaries could be built for season {resolved_season}."
            )

        public_metrics = self._load_public_metrics_frame(resolved_season)
        grades_frame = build_grade_outputs(season_summary_frame, public_metrics)
        details_by_catcher = self._build_filtered_detail_lookup(
            season_summary_frame=season_summary_frame,
            grades_frame=grades_frame,
            count_summaries_frame=count_summaries_frame,
            pitch_type_summaries_frame=pitch_type_summaries_frame,
            pairing_summaries_frame=pairing_summaries_frame,
            matchup_summaries_frame=matchup_summaries_frame,
            season=resolved_season,
        )

        catcher_a = details_by_catcher.get(catcher_a_id)
        catcher_b = details_by_catcher.get(catcher_b_id)
        if catcher_a is None:
            raise LookupError(
                f"Catcher {catcher_a_id} does not have scored comparison data for season {resolved_season}"
                + (
                    f" with team filter {normalized_team}"
                    if normalized_team
                    else ""
                )
                + "."
            )
        if catcher_b is None:
            raise LookupError(
                f"Catcher {catcher_b_id} does not have scored comparison data for season {resolved_season}"
                + (
                    f" with team filter {normalized_team}"
                    if normalized_team
                    else ""
                )
                + "."
            )

        qualified_population_size = int(
            season_summary_frame.apply(
                lambda row: self._qualified_for_grades(row.get("pitches"), row.get("games_scored")),
                axis=1,
            ).sum()
        )

        return CatcherComparisonResponse(
            filters=CatcherComparisonFilters(
                season=resolved_season,
                min_pitches=min_pitches,
                date_from=date_from,
                date_to=date_to,
                team=normalized_team,
            ),
            population_size=int(len(season_summary_frame)),
            qualified_population_size=qualified_population_size,
            updated_through=self._optional_date(scored_frame["game_date"].max()),
            model_version=model_version,
            catcher_a=catcher_a,
            catcher_b=catcher_b,
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

    def get_app_metadata(
        self,
        season: Optional[int] = None,
    ) -> AppMetadataResponse:
        default_season = self._resolve_season(None)
        selected_season = season or default_season
        current_year = date.today().year

        available_seasons_frame = read_dataframe(
            """
            SELECT season
            FROM (
                SELECT DISTINCT season
                FROM catcher_season_summary
                UNION
                SELECT DISTINCT game_year AS season
                FROM pitches_raw
                WHERE game_year IS NOT NULL
            ) seasons
            ORDER BY season DESC
            """,
            self.settings.database_url,
        )
        available_seasons = [
            int(row["season"])
            for _, row in available_seasons_frame.iterrows()
            if not pd.isna(row["season"])
        ]

        latest_available_season = available_seasons[0] if available_seasons else None
        latest_scored_frame = read_dataframe(
            """
            SELECT MAX(season) AS season
            FROM catcher_season_summary
            """,
            self.settings.database_url,
        )
        latest_scored_season = (
            self._optional_int(latest_scored_frame.iloc[0]["season"])
            if not latest_scored_frame.empty
            else None
        )

        season_rollup = read_dataframe(
            """
            WITH summary_rollup AS (
                SELECT
                    season,
                    COUNT(*) AS catcher_rows,
                    COALESCE(SUM(pitches), 0) AS total_pitches
                FROM catcher_season_summary
                GROUP BY season
            ),
            raw_rollup AS (
                SELECT
                    game_year AS season,
                    MIN(game_date) AS min_date,
                    MAX(game_date) AS max_date,
                    COUNT(*) AS raw_pitch_count,
                    MAX(created_at) AS latest_refresh_timestamp
                FROM pitches_raw
                GROUP BY game_year
            ),
            scored_rollup AS (
                SELECT
                    game_year AS season,
                    MAX(game_date) AS latest_scored_game_date,
                    COUNT(*) AS scored_pitch_count,
                    MAX(created_at) AS latest_successful_scoring_timestamp
                FROM catcher_pitch_scores
                GROUP BY game_year
            ),
            summary_updates AS (
                SELECT season, MAX(updated_at) AS updated_at FROM catcher_season_summary GROUP BY season
                UNION ALL
                SELECT season, MAX(updated_at) AS updated_at FROM catcher_count_summaries GROUP BY season
                UNION ALL
                SELECT season, MAX(updated_at) AS updated_at FROM catcher_pitch_type_summaries GROUP BY season
                UNION ALL
                SELECT season, MAX(updated_at) AS updated_at FROM catcher_pairing_summaries GROUP BY season
                UNION ALL
                SELECT season, MAX(updated_at) AS updated_at FROM catcher_matchup_summaries GROUP BY season
                UNION ALL
                SELECT season, MAX(updated_at) AS updated_at FROM catcher_grade_outputs GROUP BY season
                UNION ALL
                SELECT season, MAX(updated_at) AS updated_at FROM catcher_public_metrics GROUP BY season
            ),
            summary_update_rollup AS (
                SELECT season, MAX(updated_at) AS latest_summary_update_timestamp
                FROM summary_updates
                GROUP BY season
            ),
            model_rollup AS (
                SELECT model_version
                FROM catcher_season_summary
                WHERE season = :season
                  AND model_version IS NOT NULL
                GROUP BY model_version
                ORDER BY COUNT(*) DESC, MAX(updated_at) DESC, model_version DESC
                LIMIT 1
            )
            SELECT
                :season AS selected_season,
                COALESCE(summary_rollup.catcher_rows, 0) AS catcher_rows,
                COALESCE(summary_rollup.total_pitches, 0) AS total_pitches,
                raw_rollup.min_date,
                raw_rollup.max_date,
                raw_rollup.raw_pitch_count,
                raw_rollup.latest_refresh_timestamp,
                scored_rollup.latest_scored_game_date,
                scored_rollup.scored_pitch_count,
                scored_rollup.latest_successful_scoring_timestamp,
                summary_update_rollup.latest_summary_update_timestamp,
                (SELECT model_version FROM model_rollup) AS model_version
            FROM (SELECT :season AS season) selection
            LEFT JOIN summary_rollup
              ON summary_rollup.season = selection.season
            LEFT JOIN raw_rollup
              ON raw_rollup.season = selection.season
            LEFT JOIN scored_rollup
              ON scored_rollup.season = selection.season
            LEFT JOIN summary_update_rollup
              ON summary_update_rollup.season = selection.season
            """,
            self.settings.database_url,
            params={"season": selected_season},
        )

        season_row = season_rollup.iloc[0] if not season_rollup.empty else pd.Series(dtype=object)
        catcher_rows = self._optional_int(season_row.get("catcher_rows")) or 0
        total_pitches = self._optional_int(season_row.get("total_pitches")) or 0
        latest_ingested_game_date = self._optional_date(season_row.get("max_date"))
        latest_scored_game_date = self._optional_date(season_row.get("latest_scored_game_date"))
        latest_refresh_timestamp = self._optional_datetime(
            season_row.get("latest_refresh_timestamp")
        )
        latest_successful_scoring_timestamp = self._optional_datetime(
            season_row.get("latest_successful_scoring_timestamp")
        )
        latest_summary_update_timestamp = self._optional_datetime(
            season_row.get("latest_summary_update_timestamp")
        )
        updated_through = latest_scored_game_date or latest_ingested_game_date
        sparse_season = (
            catcher_rows < LATEST_SCORED_SEASON_MIN_CATCHERS
            or total_pitches < LATEST_SCORED_SEASON_MIN_TOTAL_PITCHES
        )
        historical_mode = latest_available_season is not None and selected_season < latest_available_season

        if sparse_season and selected_season == current_year:
            season_type_label = "Current season | sparse sample"
            season_coverage_note = (
                f"{selected_season} is available but still below the default scouting threshold "
                f"({catcher_rows} catcher rows, {total_pitches:,} scored pitches). "
                "Use it as an early-season directional read."
            )
        elif sparse_season:
            season_type_label = "Sparse season"
            season_coverage_note = (
                f"Season {selected_season} is selectable, but it is still below the default scouting "
                f"threshold ({catcher_rows} catcher rows, {total_pitches:,} scored pitches)."
            )
        elif historical_mode:
            season_type_label = "Historical season"
            season_coverage_note = (
                f"Season {selected_season} is a completed historical scouting view with "
                f"{catcher_rows} catcher rows and {total_pitches:,} scored pitches."
            )
        elif selected_season == current_year:
            season_type_label = "Current season"
            season_coverage_note = (
                f"Season {selected_season} is the current live-scoring season with "
                f"{catcher_rows} catcher rows and {total_pitches:,} scored pitches."
            )
        else:
            season_type_label = "Scored season"
            season_coverage_note = (
                f"Season {selected_season} is the latest sufficiently populated scored season with "
                f"{catcher_rows} catcher rows and {total_pitches:,} scored pitches."
            )

        teams_frame = read_dataframe(
            """
            SELECT DISTINCT team
            FROM (
                SELECT COALESCE(meta.team_abbr, metrics.team_abbr, metrics.team_name) AS team
                FROM catcher_season_summary summary
                LEFT JOIN player_metadata meta
                  ON meta.player_id = summary.catcher_id
                 AND meta.season = summary.season
                LEFT JOIN catcher_public_metrics metrics
                  ON metrics.catcher_id = summary.catcher_id
                 AND metrics.season = summary.season
                WHERE summary.season = :season
            ) teams
            WHERE team IS NOT NULL
            ORDER BY team
            """,
            self.settings.database_url,
            params={"season": selected_season},
        )
        available_teams = [
            TeamFilterOption(value=str(row["team"]), label=str(row["team"]))
            for _, row in teams_frame.iterrows()
            if self._optional_str(row.get("team"))
        ]

        return AppMetadataResponse(
            default_season=default_season,
            selected_season=selected_season,
            latest_available_season=latest_available_season,
            latest_scored_season=latest_scored_season,
            available_seasons=available_seasons,
            available_teams=available_teams,
            season_pitch_count=total_pitches,
            season_catcher_count=catcher_rows,
            sparse_season=sparse_season,
            historical_mode=historical_mode,
            live_context_ready=bool(
                latest_scored_game_date and latest_available_season == selected_season
            ),
            season_type_label=season_type_label,
            season_coverage_note=season_coverage_note,
            updated_through=updated_through,
            latest_ingested_game_date=latest_ingested_game_date,
            latest_scored_game_date=latest_scored_game_date,
            latest_refresh_timestamp=latest_refresh_timestamp,
            latest_successful_scoring_timestamp=latest_successful_scoring_timestamp,
            latest_summary_update_timestamp=latest_summary_update_timestamp,
            model_version=self._optional_str(season_row.get("model_version")),
            supports_date_range=True,
            min_date=self._optional_date(season_row.get("min_date")),
            max_date=self._optional_date(season_row.get("max_date")),
            public_data_note=(
                "Public-data-first product using observed Statcast pitch outcomes, realistic "
                "pitcher-specific alternatives, and public catcher support metrics. "
                "It does not infer private PitchCom or hidden sign intent."
            ),
        )

    def get_catcher_location_summary(
        self,
        catcher_id: int,
        season: Optional[int] = None,
    ) -> LocationSummaryResponse:
        resolved_season = self._resolve_season(season)
        frame = read_dataframe(
            """
            SELECT
                features.zone_bucket_25 AS zone,
                COUNT(*) AS pitches,
                AVG(scores.dva) AS avg_dva,
                AVG(CASE WHEN scores.outperformed_baseline THEN 1.0 ELSE 0.0 END) AS outperform_rate,
                MAX(scores.game_date) AS updated_through
            FROM catcher_pitch_scores scores
            JOIN pitch_features features
              ON features.pitch_uid = scores.pitch_uid
            WHERE scores.catcher_id = :catcher_id
              AND scores.game_year = :season
              AND features.zone_bucket_25 IS NOT NULL
            GROUP BY features.zone_bucket_25
            ORDER BY features.zone_bucket_25
            """,
            self.settings.database_url,
            params={"catcher_id": catcher_id, "season": resolved_season},
        )

        if frame.empty:
            return LocationSummaryResponse(
                catcher_id=catcher_id,
                season=resolved_season,
                available=False,
                note=(
                    "No scored location summary is available for this catcher-season yet. "
                    "The panel stays visible so missing zone context is explicit."
                ),
            )

        total_pitches = int(frame["pitches"].sum())
        weighted_avg = float(np.average(frame["avg_dva"], weights=frame["pitches"])) if total_pitches else None
        weighted_outperform = (
            float(np.average(frame["outperform_rate"], weights=frame["pitches"]))
            if total_pitches and frame["outperform_rate"].notna().any()
            else None
        )
        updated_through = self._optional_date(frame["updated_through"].max())
        cells = [
            LocationSummaryCell(
                zone=zone_bucket_to_display(row["zone"]),
                value=float(row["avg_dva"]),
                label=f"{float(row['avg_dva']):+.4f}",
                pitches=int(row["pitches"]),
                outperform_rate=self._optional_float(row.get("outperform_rate")),
            )
            for _, row in frame.iterrows()
        ]

        return LocationSummaryResponse(
            catcher_id=catcher_id,
            season=resolved_season,
            available=True,
            note=(
                "Public location summary from scored catcher pitch rows. "
                "Positive cells outperformed the weighted baseline for that zone."
            ),
            avg_dva=weighted_avg,
            outperform_rate=weighted_outperform,
            updated_through=updated_through,
            cells=cells,
        )

    def _build_catcher_report_payload(
        self,
        detail: CatcherDetailResponse,
        included_sections: list[str],
        min_pitches: int,
        export_format: str,
    ) -> dict[str, object]:
        full_pairings = self._get_pairings(
            detail.identity.catcher_id,
            detail.identity.season,
            limit=500,
        )
        full_matchups = self._get_matchup_summaries(
            detail.identity.catcher_id,
            detail.identity.season,
        )
        grade_labels = {
            "overall_game_calling": "Overall Game Calling",
            "count_leverage": "Count Leverage",
            "putaway_count": "Put-Away Counts",
            "damage_avoidance": "Damage Avoidance",
            "pitch_mix_synergy": "Pitch Mix Synergy",
            "receiving_support": "Receiving Support",
        }
        grades_payload = {
            key: {
                **value,
                "display_name": grade_labels.get(key, key.replace("_", " ").title()),
                "formula_note": detail.grade_formula_notes.get(key),
            }
            for key, value in detail.grades.model_dump(mode="json").items()
        }
        report_meta = {
            "catcher_id": detail.identity.catcher_id,
            "catcher_name": detail.identity.catcher_name,
            "team": detail.identity.team,
            "season": detail.identity.season,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "format": export_format,
            "included_sections": included_sections,
            "filters": {
                "season": detail.identity.season,
                "min_pitches": min_pitches,
                "date_from": None,
                "date_to": None,
            },
        }
        sections: dict[str, object] = {}

        if "identity" in included_sections:
            sections["identity"] = detail.identity.model_dump(mode="json")
        if "overview" in included_sections:
            sections["overview"] = {
                "pitch_count": detail.total_pitches,
                "games_scored": detail.diagnostics.games_scored,
                "total_dva": detail.total_dva,
                "avg_dva": detail.avg_dva,
                "avg_execution_gap": detail.avg_execution_gap,
                "outperformed_baseline_rate": detail.diagnostics.outperform_rate,
            }
        if "grades" in included_sections:
            sections["grades"] = grades_payload
        if "summary_metrics" in included_sections:
            sections["summary_metrics"] = {
                "pitch_count": detail.total_pitches,
                "games_scored": detail.diagnostics.games_scored,
                "total_dva": detail.total_dva,
                "avg_dva": detail.avg_dva,
                "avg_execution_gap": detail.avg_execution_gap,
                "avg_expected_rv_actual": detail.diagnostics.avg_expected_rv_actual,
                "outperformed_baseline_rate": detail.diagnostics.outperform_rate,
                "avg_surviving_candidate_count": detail.diagnostics.avg_surviving_candidate_count,
                "single_candidate_pct": detail.diagnostics.single_candidate_pct,
                "dropped_sparse_context_pct": detail.diagnostics.dropped_sparse_context_pct,
                "fallback_context_pct": detail.diagnostics.fallback_context_pct,
            }
        if "count_state_breakdown" in included_sections:
            sections["count_state_breakdown"] = [
                row.model_dump(mode="json")
                for row in detail.count_state_summaries
                if row.pitches >= min_pitches
            ]
        if "count_bucket_breakdown" in included_sections:
            sections["count_bucket_breakdown"] = [
                row.model_dump(mode="json")
                for row in detail.count_bucket_summaries
                if row.pitches >= min_pitches
            ]
        if "pitch_type_breakdown" in included_sections:
            sections["pitch_type_breakdown"] = [
                row.model_dump(mode="json")
                for row in detail.pitch_type_summaries
                if row.pitches >= min_pitches
            ]
        if "pairing_breakdown" in included_sections:
            sections["pairing_breakdown"] = [
                row.model_dump(mode="json")
                for row in full_pairings
                if row.pitches >= min_pitches
            ]
        if "platoon_matchup_breakdown" in included_sections:
            sections["platoon_matchup_breakdown"] = [
                row.model_dump(mode="json")
                for row in full_matchups
                if row.pitches >= min_pitches
            ]
        if "diagnostics" in included_sections:
            sections["diagnostics"] = detail.diagnostics.model_dump(mode="json")
        if "public_metrics" in included_sections:
            sections["public_metrics"] = detail.public_metrics.model_dump(mode="json")
        if "metadata" in included_sections:
            sections["metadata"] = {
                "public_data_note": (
                    "Observed public-data catcher report using Statcast decision quality, "
                    "pitcher-specific alternatives, and public receiving metrics. "
                    "It does not claim private PitchCom or hidden sign-call intent."
                ),
                "included_sections": included_sections,
                "filters": report_meta["filters"],
                "grade_formula_notes": detail.grade_formula_notes,
            }

        return {
            "report_meta": report_meta,
            "sections": sections,
        }

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

    def _get_available_catcher_seasons(self, catcher_id: int) -> list[int]:
        frame = read_dataframe(
            """
            SELECT season
            FROM catcher_season_summary
            WHERE catcher_id = :catcher_id
            ORDER BY season DESC
            """,
            self.settings.database_url,
            params={"catcher_id": catcher_id},
        )
        return [int(row["season"]) for _, row in frame.iterrows()]

    def _build_report_sections(
        self,
        detail: CatcherDetailResponse,
    ) -> list[ReportSectionOption]:
        public_metrics_payload = detail.public_metrics.model_dump(mode="json")
        section_row_counts = {
            "identity": 1,
            "overview": 1,
            "grades": sum(
                1 for grade in detail.grades.model_dump(mode="json").values() if grade.get("score") is not None
            ),
            "summary_metrics": 1,
            "count_state_breakdown": len(detail.count_state_summaries),
            "count_bucket_breakdown": len(detail.count_bucket_summaries),
            "pitch_type_breakdown": len(detail.pitch_type_summaries),
            "pairing_breakdown": len(self._get_pairings(detail.identity.catcher_id, detail.identity.season, limit=500)),
            "platoon_matchup_breakdown": len(detail.matchup_summaries),
            "diagnostics": 1,
            "public_metrics": sum(
                1
                for key, value in public_metrics_payload.items()
                if key != "source_note" and value is not None
            ),
            "metadata": 1,
        }

        options: list[ReportSectionOption] = []
        for key in REPORT_SECTIONS_ORDER:
            definition = REPORT_SECTION_DEFINITIONS[key]
            row_count = section_row_counts.get(key, 0)
            options.append(
                ReportSectionOption(
                    key=key,
                    label=str(definition["label"]),
                    description=str(definition["description"]),
                    available=row_count > 0,
                    default_selected=bool(definition["default_selected"]),
                    row_count=row_count,
                )
            )
        return options

    def _load_public_metrics_frame(self, season: int) -> pd.DataFrame:
        metrics = read_dataframe(
            """
            SELECT *
            FROM catcher_public_metrics
            WHERE season = :season
            """,
            self.settings.database_url,
            params={"season": season},
        )
        if not metrics.empty:
            return metrics

        return pd.DataFrame(
            columns=[
                "catcher_id",
                "season",
                "framing_runs",
                "blocking_runs",
                "blocks_above_average",
                "pop_time_2b",
                "arm_overall",
                "max_arm_strength",
                "source_note",
                "team_abbr",
                "team_name",
            ]
        )

    def _load_filtered_eligible_pitch_frame(
        self,
        season: int,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        team: Optional[str] = None,
    ) -> pd.DataFrame:
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
            LEFT JOIN player_metadata meta
              ON meta.player_id = raw.catcher_id
             AND meta.season = raw.game_year
            LEFT JOIN catcher_public_metrics metrics
              ON metrics.catcher_id = raw.catcher_id
             AND metrics.season = raw.game_year
            WHERE raw.game_year = :season
              AND raw.catcher_id IS NOT NULL
              AND raw.pitch_type IS NOT NULL
              AND raw.delta_run_exp IS NOT NULL
              AND features.zone_bucket_25 IS NOT NULL
              AND (:date_from IS NULL OR raw.game_date >= :date_from)
              AND (:date_to IS NULL OR raw.game_date <= :date_to)
              AND (:team IS NULL OR COALESCE(meta.team_abbr, metrics.team_abbr, metrics.team_name) = :team)
            """,
            self.settings.database_url,
            params={
                "season": season,
                "date_from": date_from,
                "date_to": date_to,
                "team": team,
            },
        )

    def _load_filtered_scored_pitch_frame(
        self,
        season: int,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        team: Optional[str] = None,
    ) -> pd.DataFrame:
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
                COALESCE(scores.game_date, raw.game_date) AS game_date,
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
                scores.outperformed_baseline,
                scores.model_version
            FROM catcher_pitch_scores scores
            JOIN pitches_raw raw
              ON raw.pitch_uid = scores.pitch_uid
            JOIN pitch_features features
              ON features.pitch_uid = scores.pitch_uid
            LEFT JOIN player_metadata meta
              ON meta.player_id = scores.catcher_id
             AND meta.season = COALESCE(scores.game_year, raw.game_year)
            LEFT JOIN player_metadata pitcher_meta
              ON pitcher_meta.player_id = COALESCE(scores.pitcher_id, scores.pitcher, raw.pitcher)
             AND pitcher_meta.season = COALESCE(scores.game_year, raw.game_year)
            LEFT JOIN player_identity pitcher_identity
              ON pitcher_identity.key_mlbam = COALESCE(scores.pitcher_id, scores.pitcher, raw.pitcher)
            LEFT JOIN catcher_public_metrics metrics
              ON metrics.catcher_id = scores.catcher_id
             AND metrics.season = COALESCE(scores.game_year, raw.game_year)
            WHERE COALESCE(scores.game_year, raw.game_year) = :season
              AND scores.catcher_id IS NOT NULL
              AND (:date_from IS NULL OR COALESCE(scores.game_date, raw.game_date) >= :date_from)
              AND (:date_to IS NULL OR COALESCE(scores.game_date, raw.game_date) <= :date_to)
              AND (:team IS NULL OR COALESCE(meta.team_abbr, metrics.team_abbr, metrics.team_name) = :team)
            """,
            self.settings.database_url,
            params={
                "season": season,
                "date_from": date_from,
                "date_to": date_to,
                "team": team,
            },
        )
        if frame.empty:
            return frame

        frame["game_pk"] = pd.to_numeric(frame["game_pk"], errors="coerce").astype("Int64")
        frame["pitch_family"] = frame["pitch_type"].map(pitch_type_group)
        frame["outperformed_baseline"] = frame["outperformed_baseline"].fillna(frame["dva"] > 0)
        frame["hitter_friendly_flag"] = frame["count_state"].isin(
            {"2-0", "2-1", "3-0", "3-1", "3-2"}
        )
        frame["pitcher_friendly_flag"] = frame["count_state"].isin(
            {"0-1", "0-2", "1-2", "2-2"}
        )
        frame["putaway_flag"] = frame["count_state"].isin({"0-2", "1-2", "2-2"})
        frame["damage_flag"] = frame["count_state"].isin({"2-0", "3-1", "3-2"})
        frame["matchup_label"] = (
            frame["stand"].fillna("?") + " bat / " + frame["p_throws"].fillna("?") + " throw"
        )
        return frame

    def _resolve_filtered_model_version(
        self,
        scored_frame: pd.DataFrame,
        season: int,
    ) -> Optional[str]:
        if "model_version" in scored_frame and scored_frame["model_version"].notna().any():
            mode = scored_frame["model_version"].dropna().astype(str).mode()
            if not mode.empty:
                return str(mode.iloc[0])

        frame = read_dataframe(
            """
            SELECT model_version
            FROM catcher_season_summary
            WHERE season = :season
              AND model_version IS NOT NULL
            GROUP BY model_version
            ORDER BY COUNT(*) DESC, MAX(updated_at) DESC, model_version DESC
            LIMIT 1
            """,
            self.settings.database_url,
            params={"season": season},
        )
        if frame.empty:
            return None
        return self._optional_str(frame.iloc[0].get("model_version"))

    def _load_identity_frame_for_catchers(
        self,
        catcher_ids: list[int],
        season: int,
    ) -> pd.DataFrame:
        if not catcher_ids:
            return pd.DataFrame()

        catcher_sql = ", ".join(str(int(catcher_id)) for catcher_id in sorted(set(catcher_ids)))
        return read_dataframe(
            f"""
            SELECT
                summary.catcher_id,
                summary.season,
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
            LEFT JOIN catcher_public_metrics metrics
              ON metrics.catcher_id = summary.catcher_id
             AND metrics.season = summary.season
            WHERE summary.season = :season
              AND summary.catcher_id IN ({catcher_sql})
            """,
            self.settings.database_url,
            params={"season": season},
        )

    def _build_filtered_detail_lookup(
        self,
        season_summary_frame: pd.DataFrame,
        grades_frame: pd.DataFrame,
        count_summaries_frame: pd.DataFrame,
        pitch_type_summaries_frame: pd.DataFrame,
        pairing_summaries_frame: pd.DataFrame,
        matchup_summaries_frame: pd.DataFrame,
        season: int,
    ) -> dict[int, CatcherDetailResponse]:
        if season_summary_frame.empty:
            return {}

        catcher_ids = [
            int(value)
            for value in season_summary_frame["catcher_id"].dropna().tolist()
        ]
        identity_frame = self._load_identity_frame_for_catchers(catcher_ids, season)
        summary = season_summary_frame.merge(
            grades_frame,
            on=["catcher_id", "season"],
            how="left",
        ).merge(
            identity_frame,
            on=["catcher_id", "season"],
            how="left",
        )

        details: dict[int, CatcherDetailResponse] = {}
        for _, row in summary.iterrows():
            catcher_id = int(row["catcher_id"])
            formula_notes = self._parse_formula_notes(row.get("formula_notes"))
            sample_quality = self._sample_quality(
                pitches=row.get("pitches"),
                games_scored=row.get("games_scored"),
            )
            count_state_summaries, count_bucket_summaries = self._count_summaries_from_frame(
                count_summaries_frame[count_summaries_frame["catcher_id"] == catcher_id].copy()
            )
            pitch_type_summaries = self._pitch_type_summaries_from_frame(
                pitch_type_summaries_frame[pitch_type_summaries_frame["catcher_id"] == catcher_id].copy()
            )
            pairing_summaries = self._pairing_summaries_from_frame(
                pairing_summaries_frame[pairing_summaries_frame["catcher_id"] == catcher_id].copy()
            )
            matchup_summaries = self._matchup_summaries_from_frame(
                matchup_summaries_frame[matchup_summaries_frame["catcher_id"] == catcher_id].copy()
            )
            grades = self._build_grades(row, formula_notes=formula_notes)
            diagnostics = CatcherDiagnostics(
                games_scored=self._optional_int(row.get("games_scored")) or 0,
                avg_expected_rv_actual=self._optional_float(row.get("avg_expected_rv_actual")),
                outperform_rate=self._optional_float(row.get("outperform_rate")),
                avg_surviving_candidate_count=self._optional_float(
                    row.get("avg_surviving_candidate_count")
                ),
                single_candidate_pct=self._optional_float(row.get("single_candidate_pct")),
                dropped_sparse_context_pct=self._optional_float(
                    row.get("dropped_sparse_context_pct")
                ),
                fallback_context_pct=self._optional_float(row.get("fallback_context_pct")),
                qualified_for_grades=self._qualified_for_grades(
                    pitches=row.get("pitches"),
                    games_scored=row.get("games_scored"),
                ),
                stability_label=str(sample_quality["label"]),
                stability_note=str(sample_quality["note"]),
                model_version=self._optional_str(row.get("model_version")),
            )
            summary_insights = self._build_summary_insights(
                catcher_name=str(row.get("catcher_name") or f"Catcher {catcher_id}"),
                total_pitches=int(row["pitches"]),
                total_dva=float(row["total_dva"]),
                avg_dva=float(row["avg_dva"]),
                avg_execution_gap=self._optional_float(row.get("avg_execution_gap")),
                grades=grades,
                diagnostics=diagnostics,
                count_state_summaries=count_state_summaries,
                count_bucket_summaries=count_bucket_summaries,
                pitch_type_summaries=pitch_type_summaries,
                pairings=pairing_summaries,
            )

            details[catcher_id] = CatcherDetailResponse(
                identity=self._build_identity(row, catcher_id, season),
                total_pitches=int(row["pitches"]),
                total_dva=float(row["total_dva"]),
                avg_dva=float(row["avg_dva"]),
                avg_execution_gap=self._optional_float(row.get("avg_execution_gap")),
                grades=grades,
                public_metrics=self._build_public_metrics(row),
                diagnostics=diagnostics,
                grade_formula_notes=formula_notes,
                summary_insights=summary_insights,
                count_state_summaries=count_state_summaries,
                count_bucket_summaries=count_bucket_summaries,
                pitch_type_summaries=pitch_type_summaries,
                pairings=pairing_summaries,
                matchup_summaries=matchup_summaries,
            )

        return details

    def _count_summaries_from_frame(
        self,
        frame: pd.DataFrame,
    ) -> tuple[list[CountSummary], list[CountSummary]]:
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

    def _pitch_type_summaries_from_frame(self, frame: pd.DataFrame) -> list[PitchTypeSummary]:
        if frame.empty:
            return []
        ordered = frame.sort_values(["pitches", "avg_dva", "pitch_type"], ascending=[False, False, True])
        return [self._build_pitch_type_summary(row) for _, row in ordered.iterrows()]

    def _pairing_summaries_from_frame(self, frame: pd.DataFrame) -> list[PairingSummary]:
        if frame.empty:
            return []
        ordered = frame.sort_values(["pitches", "avg_dva", "pitcher_id"], ascending=[False, False, True])
        return [self._build_pairing_summary(row) for _, row in ordered.iterrows()]

    def _matchup_summaries_from_frame(self, frame: pd.DataFrame) -> list[MatchupSummary]:
        if frame.empty:
            return []
        ordered = frame.sort_values(["pitches", "matchup_label"], ascending=[False, True])
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
            for _, row in ordered.iterrows()
        ]

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
        return self._count_summaries_from_frame(frame)

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
        return self._pitch_type_summaries_from_frame(frame)

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
        return self._pairing_summaries_from_frame(frame)

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
        return self._matchup_summaries_from_frame(frame)

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

    def _format_signed(self, value: Optional[float], digits: int = 3) -> str:
        if value is None:
            return "--"
        return f"{value:+.{digits}f}"

    def _format_pct(self, value: Optional[float], digits: int = 1) -> str:
        if value is None:
            return "--"
        return f"{value * 100:.{digits}f}%"

    def _count_split_sample_quality(self, pitches: object) -> dict[str, object]:
        pitch_count = self._optional_int(pitches) or 0
        if pitch_count >= COUNT_SPLIT_STABLE_MIN:
            return {"label": "Stable split", "low_sample": False}
        if pitch_count > COUNT_SPLIT_LOW_SAMPLE_MAX:
            return {"label": "Moderate split", "low_sample": False}
        return {"label": "Low split sample", "low_sample": True}

    def _count_context_label(self, row: CountSummary) -> str:
        if row.putaway_flag:
            return "put-away count"
        if row.pitcher_friendly_flag:
            return "pitcher-friendly count"
        if row.hitter_friendly_flag:
            return "hitter-friendly count"
        return "neutral count"

    def _build_summary_insights(
        self,
        catcher_name: str,
        total_pitches: int,
        total_dva: float,
        avg_dva: float,
        avg_execution_gap: Optional[float],
        grades: CatcherGrades,
        diagnostics: CatcherDiagnostics,
        count_state_summaries: list[CountSummary],
        count_bucket_summaries: list[CountSummary],
        pitch_type_summaries: list[PitchTypeSummary],
        pairings: list[PairingSummary],
    ) -> list[CatcherSummaryInsight]:
        insights: list[CatcherSummaryInsight] = []

        grade_options = [
            ("Overall game calling", grades.overall_game_calling),
            ("Count leverage", grades.count_leverage),
            ("Put-away counts", grades.putaway_count),
            ("Damage avoidance", grades.damage_avoidance),
            ("Pitch mix synergy", grades.pitch_mix_synergy),
            ("Receiving support", grades.receiving_support),
        ]
        best_grade = max(
            (option for option in grade_options if option[1].score is not None),
            key=lambda option: option[1].score or 0.0,
            default=None,
        )
        if best_grade is not None:
            best_grade_label, best_grade_value = best_grade
            insights.append(
                CatcherSummaryInsight(
                    key="overall_profile",
                    label="Strength",
                    headline=f"{best_grade_label} is the clearest carrying tool.",
                    detail=(
                        f"{catcher_name} posts a {best_grade_value.score:.1f} "
                        f"{best_grade_value.label or 'scored'} grade in {best_grade_label.lower()}, with "
                        f"{self._format_signed(total_dva, 3)} total DVA, "
                        f"{self._format_signed(avg_dva, 5)} avg DVA, and "
                        f"{self._format_pct(diagnostics.outperform_rate)} baseline outperformance overall."
                    ),
                    tone="positive" if (best_grade_value.score or 0) >= 50 and total_dva >= 0 else "neutral",
                )
            )
        else:
            insights.append(
                CatcherSummaryInsight(
                    key="overall_profile",
                    label="Strength",
                    headline="The season line is still forming.",
                    detail=(
                        f"{catcher_name} has {self._format_signed(total_dva, 3)} total DVA and "
                        f"{self._format_signed(avg_dva, 5)} avg DVA so far, but no grade component is stable "
                        "enough yet to call a true carrying tool."
                    ),
                    tone="neutral",
                )
            )

        count_rows = [row for row in count_state_summaries if row.pitches >= COUNT_STATE_INSIGHT_MIN_PITCHES]
        if not count_rows:
            count_rows = count_state_summaries
        strongest_count = max(count_rows, key=lambda row: row.avg_dva, default=None)
        bucket_rows = [row for row in count_bucket_summaries if row.pitches >= COUNT_STATE_INSIGHT_MIN_PITCHES]
        if not bucket_rows:
            bucket_rows = count_bucket_summaries
        strongest_bucket = max(bucket_rows, key=lambda row: row.avg_dva, default=None)
        if strongest_count is not None:
            detail = (
                f"Best exact-count edge is {strongest_count.split_value} "
                f"({self._count_context_label(strongest_count)}) at "
                f"{self._format_signed(strongest_count.avg_dva, 4)} avg DVA over "
                f"{strongest_count.pitches:,} pitches."
            )
            if strongest_count.recommended_pitch_family:
                detail += f" Best-performing family signal there is {strongest_count.recommended_pitch_family}."
            if strongest_bucket is not None and strongest_bucket.split_value != strongest_count.split_value:
                detail += (
                    f" The broader {strongest_bucket.split_value.replace('_', ' ')} bucket sits at "
                    f"{self._format_signed(strongest_bucket.avg_dva, 4)} avg DVA."
                )
            insights.append(
                CatcherSummaryInsight(
                    key="situational_edge",
                    label="Situational edge",
                    headline=(
                        f"{strongest_count.split_value} is the best value pocket."
                        if strongest_count.avg_dva > 0
                        else "No exact count is clearly winning yet."
                    ),
                    detail=detail,
                    tone="positive" if strongest_count.avg_dva > 0 else "neutral",
                )
            )

        pitch_rows = [row for row in pitch_type_summaries if row.pitches >= PITCH_TYPE_INSIGHT_MIN_PITCHES]
        if not pitch_rows:
            pitch_rows = pitch_type_summaries
        pairing_rows = [row for row in pairings if row.pitches >= PAIRING_INSIGHT_MIN_PITCHES]
        if not pairing_rows:
            pairing_rows = pairings
        best_pitch = max(pitch_rows, key=lambda row: row.avg_dva, default=None)
        best_pairing = max(pairing_rows, key=lambda row: row.total_dva, default=None)
        pitch_pairing_detail_parts: list[str] = []
        if best_pitch is not None:
            pitch_pairing_detail_parts.append(
                f"{best_pitch.pitch_type} is the best pitch-type result at "
                f"{self._format_signed(best_pitch.avg_dva, 4)} avg DVA over {best_pitch.pitches:,} pitches"
            )
        if best_pairing is not None:
            pitch_pairing_detail_parts.append(
                f"the strongest pairing is with {best_pairing.pitcher_name} at "
                f"{self._format_signed(best_pairing.total_dva, 3)} total DVA over {best_pairing.pitches:,} pitches"
            )
        if pitch_pairing_detail_parts:
            insights.append(
                CatcherSummaryInsight(
                    key="pitch_pairing_edge",
                    label="Pitch + pairing edge",
                    headline="Pitch mix and battery fit add most of the secondary value.",
                    detail="; ".join(pitch_pairing_detail_parts) + ".",
                    tone=(
                        "positive"
                        if (best_pitch is not None and best_pitch.avg_dva > 0)
                        or (best_pairing is not None and best_pairing.total_dva > 0)
                        else "neutral"
                    ),
                )
            )

        weakest_count = min(count_rows, key=lambda row: row.avg_dva, default=None)
        weakest_pitch = min(pitch_rows, key=lambda row: row.avg_dva, default=None)
        if weakest_count is not None and weakest_count.avg_dva < 0:
            weakness_detail = (
                f"The weakest exact-count pocket is {weakest_count.split_value} "
                f"({self._count_context_label(weakest_count)}) at "
                f"{self._format_signed(weakest_count.avg_dva, 4)} avg DVA over "
                f"{weakest_count.pitches:,} pitches."
            )
            if weakest_pitch is not None and weakest_pitch.avg_dva < 0:
                weakness_detail += (
                    f" The softest pitch-type result is {weakest_pitch.pitch_type} at "
                    f"{self._format_signed(weakest_pitch.avg_dva, 4)} avg DVA."
                )
            insights.append(
                CatcherSummaryInsight(
                    key="weakness",
                    label="Weakness",
                    headline=f"{weakest_count.split_value} is the main pressure point.",
                    detail=weakness_detail,
                    tone="caution",
                )
            )
        elif weakest_pitch is not None and weakest_pitch.avg_dva < 0:
            insights.append(
                CatcherSummaryInsight(
                    key="weakness",
                    label="Weakness",
                    headline=f"{weakest_pitch.pitch_type} is the weakest pitch-type pocket.",
                    detail=(
                        f"{weakest_pitch.pitch_type} is returning "
                        f"{self._format_signed(weakest_pitch.avg_dva, 4)} avg DVA over "
                        f"{weakest_pitch.pitches:,} pitches, so that pitch mix is the first place to pressure-test."
                    ),
                    tone="caution",
                )
            )
        else:
            insights.append(
                CatcherSummaryInsight(
                    key="weakness",
                    label="Weakness",
                    headline="There is no large negative pocket yet.",
                    detail=(
                        f"The weakest available exact-count result is still only "
                        f"{self._format_signed(weakest_count.avg_dva if weakest_count is not None else None, 4)}. "
                        "Treat the page as a search for smaller directional edges rather than one glaring flaw."
                    ),
                    tone="neutral",
                )
            )

        confidence_parts = [
            f"{diagnostics.stability_label or 'Sample status unavailable'} at {total_pitches:,} pitches across {(diagnostics.games_scored or 0):,} games"
        ]
        if diagnostics.dropped_sparse_context_pct is not None:
            confidence_parts.append(
                f"{self._format_pct(diagnostics.dropped_sparse_context_pct)} of eligible contexts dropped for sparse alternatives"
            )
        elif diagnostics.fallback_context_pct is not None:
            confidence_parts.append(
                f"{self._format_pct(diagnostics.fallback_context_pct)} fallback-context rate"
            )
        elif diagnostics.single_candidate_pct is not None:
            confidence_parts.append(
                f"{self._format_pct(diagnostics.single_candidate_pct)} single-candidate contexts"
            )
        if avg_execution_gap is not None:
            confidence_parts.append(
                f"{self._format_signed(avg_execution_gap, 4)} avg execution gap"
            )
        insights.append(
            CatcherSummaryInsight(
                key="confidence",
                label="Data confidence",
                headline=(
                    "The sample is trustworthy enough for season-level scouting."
                    if diagnostics.qualified_for_grades
                    else "The sample is still directional rather than settled."
                ),
                detail=". ".join(confidence_parts) + ".",
                tone="positive" if diagnostics.qualified_for_grades else "caution",
            )
        )

        return insights[:5]

    def _build_count_summary(self, row: pd.Series) -> CountSummary:
        sample_quality = self._count_split_sample_quality(row.get("pitches"))
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
            sample_label=str(sample_quality["label"]),
            low_sample=bool(sample_quality["low_sample"]),
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
        pitcher_id = int(row["pitcher_id"])
        return PairingSummary(
            pitcher_id=pitcher_id,
            pitcher_name=self._optional_str(row.get("pitcher_name")) or f"Pitcher {pitcher_id}",
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

    def _optional_date(self, value: object) -> Optional[date]:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None
        if isinstance(value, date) and not isinstance(value, datetime):
            return value
        if isinstance(value, datetime):
            return value.date()
        try:
            timestamp = pd.to_datetime(value)
        except (TypeError, ValueError):
            return None
        if pd.isna(timestamp):
            return None
        if isinstance(timestamp, pd.Timestamp):
            return timestamp.date()
        return None

    def _optional_datetime(self, value: object) -> Optional[datetime]:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        try:
            timestamp = pd.to_datetime(value, utc=True)
        except (TypeError, ValueError):
            return None
        if pd.isna(timestamp):
            return None
        if isinstance(timestamp, pd.Timestamp):
            return timestamp.to_pydatetime()
        return None

    def _normalized_team_filter(self, team: Optional[str]) -> Optional[str]:
        if not team:
            return None
        text = team.strip().upper()
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
