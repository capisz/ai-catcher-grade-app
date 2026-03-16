import { z } from "zod";

export const heatCellSchema = z.object({
  zone: z.string(),
  value: z.number(),
  label: z.string(),
});

export const trendPointSchema = z.object({
  label: z.string(),
  dva_total: z.number(),
});

export const pitchMixPointSchema = z.object({
  pitch_type: z.string(),
  share: z.number(),
  dva: z.number(),
});

export const catcherOptionSchema = z.object({
  catcher_id: z.number(),
  catcher_name: z.string(),
  team: z.string().nullable().optional(),
  season: z.number(),
  dropdown_label: z.string(),
  headshot_url: z.string().nullable().optional(),
  bats: z.string().nullable().optional(),
  throws: z.string().nullable().optional(),
  active: z.boolean().default(false),
  key_person: z.string().nullable().optional(),
  key_uuid: z.string().nullable().optional(),
  key_bbref: z.string().nullable().optional(),
  key_fangraphs: z.string().nullable().optional(),
  key_retro: z.string().nullable().optional(),
});

export const catchersResponseSchema = z.object({
  season: z.number(),
  catchers: z.array(catcherOptionSchema),
});

export const teamFilterOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

export const reportFormatOptionSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  available: z.boolean().default(true),
});

export const reportSectionOptionSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  available: z.boolean().default(true),
  default_selected: z.boolean().default(false),
  row_count: z.number().nullable().optional(),
});

export const catcherReportOptionsResponseSchema = z.object({
  catcher_id: z.number(),
  catcher_name: z.string(),
  selected_season: z.number(),
  available_seasons: z.array(z.number()),
  formats: z.array(reportFormatOptionSchema),
  sections: z.array(reportSectionOptionSchema),
  supports_date_range: z.boolean().default(false),
  supports_min_pitches: z.boolean().default(true),
  default_min_pitches: z.number().default(20),
});

export const gradeValueSchema = z.object({
  score: z.number().nullable().optional(),
  label: z.string().nullable().optional(),
  qualified: z.boolean().default(false),
  population_size: z.number().nullable().optional(),
  stability_note: z.string().nullable().optional(),
});

export const catcherGradesSchema = z.object({
  overall_game_calling: gradeValueSchema,
  count_leverage: gradeValueSchema,
  putaway_count: gradeValueSchema,
  damage_avoidance: gradeValueSchema,
  pitch_mix_synergy: gradeValueSchema,
  receiving_support: gradeValueSchema,
});

export const publicCatcherMetricsSchema = z.object({
  framing_runs: z.number().nullable().optional(),
  blocking_runs: z.number().nullable().optional(),
  blocks_above_average: z.number().nullable().optional(),
  pop_time_2b: z.number().nullable().optional(),
  arm_overall: z.number().nullable().optional(),
  max_arm_strength: z.number().nullable().optional(),
  source_note: z.string().nullable().optional(),
});

export const leaderboardEntrySchema = z.object({
  catcher_id: z.number(),
  catcher_name: z.string(),
  team: z.string().nullable().optional(),
  season: z.number(),
  headshot_url: z.string().nullable().optional(),
  key_person: z.string().nullable().optional(),
  key_bbref: z.string().nullable().optional(),
  key_fangraphs: z.string().nullable().optional(),
  key_retro: z.string().nullable().optional(),
  pitches: z.number(),
  games_scored: z.number().default(0),
  total_dva: z.number(),
  avg_dva: z.number(),
  avg_execution_gap: z.number().nullable().optional(),
  outperform_rate: z.number().nullable().optional(),
  qualified_for_grades: z.boolean().default(false),
  stability_label: z.string().nullable().optional(),
  stability_note: z.string().nullable().optional(),
  grades: catcherGradesSchema,
  public_metrics: publicCatcherMetricsSchema,
});

export const leaderboardResponseSchema = z.object({
  season: z.number(),
  leaderboard: z.array(leaderboardEntrySchema),
});

export const countSummarySchema = z.object({
  split_type: z.string(),
  split_value: z.string(),
  pitches: z.number(),
  total_dva: z.number(),
  avg_dva: z.number(),
  avg_execution_gap: z.number().nullable().optional(),
  avg_expected_rv_actual: z.number().nullable().optional(),
  outperform_rate: z.number().nullable().optional(),
  fastball_rate: z.number().nullable().optional(),
  breaker_rate: z.number().nullable().optional(),
  offspeed_rate: z.number().nullable().optional(),
  fastball_dva: z.number().nullable().optional(),
  breaker_dva: z.number().nullable().optional(),
  offspeed_dva: z.number().nullable().optional(),
  actual_top_pitch_family: z.string().nullable().optional(),
  recommended_pitch_family: z.string().nullable().optional(),
  hitter_friendly_flag: z.boolean().default(false),
  pitcher_friendly_flag: z.boolean().default(false),
  putaway_flag: z.boolean().default(false),
  sample_label: z.string().nullable().optional(),
  low_sample: z.boolean().default(false),
});

export const pitchTypeSummarySchema = z.object({
  pitch_type: z.string(),
  pitch_family: z.string().nullable().optional(),
  pitches: z.number(),
  total_dva: z.number(),
  avg_dva: z.number(),
  avg_execution_gap: z.number().nullable().optional(),
  avg_expected_rv_actual: z.number().nullable().optional(),
  outperform_rate: z.number().nullable().optional(),
});

export const pairingSummarySchema = z.object({
  pitcher_id: z.number(),
  pitcher_name: z.string(),
  pitches: z.number(),
  total_dva: z.number(),
  avg_dva: z.number(),
  avg_execution_gap: z.number().nullable().optional(),
  avg_expected_rv_actual: z.number().nullable().optional(),
  outperform_rate: z.number().nullable().optional(),
});

export const matchupSummarySchema = z.object({
  stand: z.string(),
  p_throws: z.string(),
  matchup_label: z.string(),
  pitches: z.number(),
  total_dva: z.number(),
  avg_dva: z.number(),
  avg_execution_gap: z.number().nullable().optional(),
  outperform_rate: z.number().nullable().optional(),
});

export const catcherIdentitySchema = z.object({
  catcher_id: z.number(),
  catcher_name: z.string(),
  team: z.string().nullable().optional(),
  season: z.number(),
  headshot_url: z.string().nullable().optional(),
  bats: z.string().nullable().optional(),
  throws: z.string().nullable().optional(),
  active: z.boolean().default(false),
  dropdown_label: z.string().nullable().optional(),
  key_person: z.string().nullable().optional(),
  key_uuid: z.string().nullable().optional(),
  key_bbref: z.string().nullable().optional(),
  key_fangraphs: z.string().nullable().optional(),
  key_retro: z.string().nullable().optional(),
});

export const catcherDiagnosticsSchema = z.object({
  games_scored: z.number().nullable().optional(),
  avg_expected_rv_actual: z.number().nullable().optional(),
  outperform_rate: z.number().nullable().optional(),
  avg_surviving_candidate_count: z.number().nullable().optional(),
  single_candidate_pct: z.number().nullable().optional(),
  dropped_sparse_context_pct: z.number().nullable().optional(),
  fallback_context_pct: z.number().nullable().optional(),
  qualified_for_grades: z.boolean().default(false),
  stability_label: z.string().nullable().optional(),
  stability_note: z.string().nullable().optional(),
  model_version: z.string().nullable().optional(),
});

export const catcherSummaryInsightSchema = z.object({
  key: z.string(),
  label: z.string(),
  headline: z.string(),
  detail: z.string(),
  tone: z.enum(["positive", "neutral", "caution"]).default("neutral"),
});

export const catcherDetailResponseSchema = z.object({
  identity: catcherIdentitySchema,
  total_pitches: z.number(),
  total_dva: z.number(),
  avg_dva: z.number(),
  avg_execution_gap: z.number().nullable().optional(),
  grades: catcherGradesSchema,
  public_metrics: publicCatcherMetricsSchema,
  diagnostics: catcherDiagnosticsSchema,
  grade_formula_notes: z.record(z.string(), z.record(z.string(), z.any())),
  summary_insights: z.array(catcherSummaryInsightSchema).default([]),
  count_state_summaries: z.array(countSummarySchema),
  count_bucket_summaries: z.array(countSummarySchema),
  pitch_type_summaries: z.array(pitchTypeSummarySchema),
  pairings: z.array(pairingSummarySchema),
  matchup_summaries: z.array(matchupSummarySchema),
});

export const catcherComparisonFiltersSchema = z.object({
  season: z.number(),
  min_pitches: z.number().default(0),
  date_from: z.string().nullable().optional(),
  date_to: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
});

export const catcherComparisonResponseSchema = z.object({
  filters: catcherComparisonFiltersSchema,
  population_size: z.number().default(0),
  qualified_population_size: z.number().default(0),
  updated_through: z.string().nullable().optional(),
  model_version: z.string().nullable().optional(),
  catcher_a: catcherDetailResponseSchema,
  catcher_b: catcherDetailResponseSchema,
});

export const pairingsResponseSchema = z.object({
  catcher_id: z.number(),
  season: z.number(),
  pairings: z.array(pairingSummarySchema),
});

export const countsResponseSchema = z.object({
  catcher_id: z.number(),
  season: z.number(),
  count_state_summaries: z.array(countSummarySchema),
  count_bucket_summaries: z.array(countSummarySchema),
});

export const pitchTypesResponseSchema = z.object({
  catcher_id: z.number(),
  season: z.number(),
  pitch_types: z.array(pitchTypeSummarySchema),
});

export const locationSummaryCellSchema = z.object({
  zone: z.string(),
  value: z.number(),
  label: z.string(),
  pitches: z.number(),
  outperform_rate: z.number().nullable().optional(),
});

export const locationSummaryResponseSchema = z.object({
  catcher_id: z.number(),
  season: z.number(),
  available: z.boolean().default(false),
  note: z.string().nullable().optional(),
  avg_dva: z.number().nullable().optional(),
  outperform_rate: z.number().nullable().optional(),
  updated_through: z.string().nullable().optional(),
  cells: z.array(locationSummaryCellSchema),
});

export const appMetadataResponseSchema = z.object({
  default_season: z.number(),
  selected_season: z.number(),
  latest_available_season: z.number().nullable().optional(),
  latest_scored_season: z.number().nullable().optional(),
  available_seasons: z.array(z.number()),
  available_teams: z.array(teamFilterOptionSchema),
  season_pitch_count: z.number().default(0),
  season_catcher_count: z.number().default(0),
  sparse_season: z.boolean().default(false),
  historical_mode: z.boolean().default(false),
  live_context_ready: z.boolean().default(false),
  season_type_label: z.string(),
  season_coverage_note: z.string(),
  updated_through: z.string().nullable().optional(),
  latest_ingested_game_date: z.string().nullable().optional(),
  latest_scored_game_date: z.string().nullable().optional(),
  latest_refresh_timestamp: z.string().datetime().nullable().optional(),
  latest_successful_scoring_timestamp: z.string().datetime().nullable().optional(),
  latest_summary_update_timestamp: z.string().datetime().nullable().optional(),
  model_version: z.string().nullable().optional(),
  supports_date_range: z.boolean().default(true),
  min_date: z.string().nullable().optional(),
  max_date: z.string().nullable().optional(),
  public_data_note: z.string(),
});

export const recommendationOptionSchema = z.object({
  pitch_type: z.string(),
  pitch_name: z.string().nullable().optional(),
  pitch_type_group: z.string().nullable().optional(),
  expected_rv: z.number(),
  usage_share: z.number(),
  zone_bucket_25: z.string().nullable().optional(),
  zone_bucket_9: z.string().nullable().optional(),
  target_plate_x: z.number().nullable().optional(),
  target_plate_z: z.number().nullable().optional(),
});

export const recommendationResponseSchema = z.object({
  catcher_id: z.number().nullable().optional(),
  pitcher_id: z.number(),
  batter_id: z.number().nullable().optional(),
  stand: z.string(),
  p_throws: z.string(),
  count_state: z.string(),
  count_bucket: z.string(),
  base_state: z.string(),
  outs_state: z.string(),
  platoon_flag: z.string(),
  candidate_count: z.number(),
  weighted_expected_rv: z.number().nullable().optional(),
  model_version: z.string(),
  note: z.string(),
  options: z.array(recommendationOptionSchema),
});

export type CatcherOption = z.infer<typeof catcherOptionSchema>;
export type ReportFormatOption = z.infer<typeof reportFormatOptionSchema>;
export type ReportSectionOption = z.infer<typeof reportSectionOptionSchema>;
export type HeatCell = z.infer<typeof heatCellSchema>;
export type TrendPoint = z.infer<typeof trendPointSchema>;
export type PitchMixPoint = z.infer<typeof pitchMixPointSchema>;
export type CatchersResponse = z.infer<typeof catchersResponseSchema>;
export type TeamFilterOption = z.infer<typeof teamFilterOptionSchema>;
export type CatcherReportOptionsResponse = z.infer<typeof catcherReportOptionsResponseSchema>;
export type GradeValue = z.infer<typeof gradeValueSchema>;
export type CatcherGrades = z.infer<typeof catcherGradesSchema>;
export type PublicCatcherMetrics = z.infer<typeof publicCatcherMetricsSchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;
export type CountSummary = z.infer<typeof countSummarySchema>;
export type PitchTypeSummary = z.infer<typeof pitchTypeSummarySchema>;
export type PairingSummary = z.infer<typeof pairingSummarySchema>;
export type MatchupSummary = z.infer<typeof matchupSummarySchema>;
export type CatcherIdentity = z.infer<typeof catcherIdentitySchema>;
export type CatcherDiagnostics = z.infer<typeof catcherDiagnosticsSchema>;
export type CatcherSummaryInsight = z.infer<typeof catcherSummaryInsightSchema>;
export type CatcherDetailResponse = z.infer<typeof catcherDetailResponseSchema>;
export type CatcherComparisonFilters = z.infer<typeof catcherComparisonFiltersSchema>;
export type CatcherComparisonResponse = z.infer<typeof catcherComparisonResponseSchema>;
export type PairingsResponse = z.infer<typeof pairingsResponseSchema>;
export type CountsResponse = z.infer<typeof countsResponseSchema>;
export type PitchTypesResponse = z.infer<typeof pitchTypesResponseSchema>;
export type LocationSummaryCell = z.infer<typeof locationSummaryCellSchema>;
export type LocationSummaryResponse = z.infer<typeof locationSummaryResponseSchema>;
export type AppMetadataResponse = z.infer<typeof appMetadataResponseSchema>;
export type RecommendationOption = z.infer<typeof recommendationOptionSchema>;
export type RecommendationResponse = z.infer<typeof recommendationResponseSchema>;
