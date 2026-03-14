from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class CatcherOption(BaseModel):
    catcher_id: int
    catcher_name: str
    team: Optional[str] = None
    season: int
    dropdown_label: str
    headshot_url: Optional[str] = None
    bats: Optional[str] = None
    throws: Optional[str] = None
    active: bool = False
    key_person: Optional[str] = None
    key_uuid: Optional[str] = None
    key_bbref: Optional[str] = None
    key_fangraphs: Optional[str] = None
    key_retro: Optional[str] = None


class CatchersResponse(BaseModel):
    season: int
    catchers: list[CatcherOption]


class GradeValue(BaseModel):
    score: Optional[float] = None
    label: Optional[str] = None
    qualified: bool = False
    population_size: Optional[int] = None
    stability_note: Optional[str] = None


class CatcherGrades(BaseModel):
    overall_game_calling: GradeValue = Field(default_factory=GradeValue)
    count_leverage: GradeValue = Field(default_factory=GradeValue)
    putaway_count: GradeValue = Field(default_factory=GradeValue)
    damage_avoidance: GradeValue = Field(default_factory=GradeValue)
    pitch_mix_synergy: GradeValue = Field(default_factory=GradeValue)
    receiving_support: GradeValue = Field(default_factory=GradeValue)


class PublicCatcherMetrics(BaseModel):
    framing_runs: Optional[float] = None
    blocking_runs: Optional[float] = None
    blocks_above_average: Optional[float] = None
    pop_time_2b: Optional[float] = None
    arm_overall: Optional[float] = None
    max_arm_strength: Optional[float] = None
    source_note: Optional[str] = None


class LeaderboardEntry(BaseModel):
    catcher_id: int
    catcher_name: str
    team: Optional[str] = None
    season: int
    headshot_url: Optional[str] = None
    key_person: Optional[str] = None
    key_bbref: Optional[str] = None
    key_fangraphs: Optional[str] = None
    key_retro: Optional[str] = None
    pitches: int
    games_scored: int = 0
    total_dva: float
    avg_dva: float
    avg_execution_gap: Optional[float] = None
    outperform_rate: Optional[float] = None
    qualified_for_grades: bool = False
    stability_label: Optional[str] = None
    stability_note: Optional[str] = None
    grades: CatcherGrades = Field(default_factory=CatcherGrades)
    public_metrics: PublicCatcherMetrics = Field(default_factory=PublicCatcherMetrics)


class LeaderboardResponse(BaseModel):
    season: int
    leaderboard: list[LeaderboardEntry]


class CountSummary(BaseModel):
    split_type: str
    split_value: str
    pitches: int
    total_dva: float
    avg_dva: float
    avg_execution_gap: Optional[float] = None
    avg_expected_rv_actual: Optional[float] = None
    outperform_rate: Optional[float] = None
    fastball_rate: Optional[float] = None
    breaker_rate: Optional[float] = None
    offspeed_rate: Optional[float] = None
    fastball_dva: Optional[float] = None
    breaker_dva: Optional[float] = None
    offspeed_dva: Optional[float] = None
    actual_top_pitch_family: Optional[str] = None
    recommended_pitch_family: Optional[str] = None
    hitter_friendly_flag: bool = False
    pitcher_friendly_flag: bool = False
    putaway_flag: bool = False


class PitchTypeSummary(BaseModel):
    pitch_type: str
    pitch_family: Optional[str] = None
    pitches: int
    total_dva: float
    avg_dva: float
    avg_execution_gap: Optional[float] = None
    avg_expected_rv_actual: Optional[float] = None
    outperform_rate: Optional[float] = None


class PairingSummary(BaseModel):
    pitcher_id: int
    pitcher_name: str
    pitches: int
    total_dva: float
    avg_dva: float
    avg_execution_gap: Optional[float] = None
    avg_expected_rv_actual: Optional[float] = None
    outperform_rate: Optional[float] = None


class MatchupSummary(BaseModel):
    stand: str
    p_throws: str
    matchup_label: str
    pitches: int
    total_dva: float
    avg_dva: float
    avg_execution_gap: Optional[float] = None
    outperform_rate: Optional[float] = None


class CatcherIdentity(BaseModel):
    catcher_id: int
    catcher_name: str
    team: Optional[str] = None
    season: int
    headshot_url: Optional[str] = None
    bats: Optional[str] = None
    throws: Optional[str] = None
    active: bool = False
    dropdown_label: Optional[str] = None
    key_person: Optional[str] = None
    key_uuid: Optional[str] = None
    key_bbref: Optional[str] = None
    key_fangraphs: Optional[str] = None
    key_retro: Optional[str] = None


class CatcherDiagnostics(BaseModel):
    games_scored: Optional[int] = None
    avg_expected_rv_actual: Optional[float] = None
    outperform_rate: Optional[float] = None
    avg_surviving_candidate_count: Optional[float] = None
    single_candidate_pct: Optional[float] = None
    dropped_sparse_context_pct: Optional[float] = None
    fallback_context_pct: Optional[float] = None
    qualified_for_grades: bool = False
    stability_label: Optional[str] = None
    stability_note: Optional[str] = None
    model_version: Optional[str] = None


class CatcherDetailResponse(BaseModel):
    identity: CatcherIdentity
    total_pitches: int
    total_dva: float
    avg_dva: float
    avg_execution_gap: Optional[float] = None
    grades: CatcherGrades = Field(default_factory=CatcherGrades)
    public_metrics: PublicCatcherMetrics = Field(default_factory=PublicCatcherMetrics)
    diagnostics: CatcherDiagnostics = Field(default_factory=CatcherDiagnostics)
    grade_formula_notes: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    count_state_summaries: list[CountSummary]
    count_bucket_summaries: list[CountSummary]
    pitch_type_summaries: list[PitchTypeSummary]
    pairings: list[PairingSummary]
    matchup_summaries: list[MatchupSummary]


class PairingsResponse(BaseModel):
    catcher_id: int
    season: int
    pairings: list[PairingSummary]


class CountsResponse(BaseModel):
    catcher_id: int
    season: int
    count_state_summaries: list[CountSummary]
    count_bucket_summaries: list[CountSummary]


class PitchTypesResponse(BaseModel):
    catcher_id: int
    season: int
    pitch_types: list[PitchTypeSummary]


class RecommendationOption(BaseModel):
    pitch_type: str
    pitch_name: Optional[str] = None
    pitch_type_group: Optional[str] = None
    expected_rv: float
    usage_share: float
    zone_bucket_25: Optional[str] = None
    zone_bucket_9: Optional[str] = None
    target_plate_x: Optional[float] = None
    target_plate_z: Optional[float] = None


class RecommendationResponse(BaseModel):
    catcher_id: Optional[int] = None
    pitcher_id: int
    batter_id: Optional[int] = None
    stand: str
    p_throws: str
    count_state: str
    count_bucket: str
    base_state: str
    outs_state: str
    platoon_flag: str
    candidate_count: int
    weighted_expected_rv: Optional[float] = None
    model_version: str
    note: str
    options: list[RecommendationOption]
