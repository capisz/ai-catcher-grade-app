CREATE TABLE IF NOT EXISTS pitches_raw (
    pitch_uid TEXT PRIMARY KEY,
    game_pk BIGINT NOT NULL,
    game_date DATE NOT NULL,
    game_year INT NOT NULL,
    at_bat_number INT NOT NULL,
    pitch_number INT NOT NULL,
    pitcher BIGINT NOT NULL,
    batter BIGINT NOT NULL,
    catcher_id BIGINT,
    pitch_type TEXT,
    pitch_name TEXT,
    stand TEXT,
    p_throws TEXT,
    balls INT,
    strikes INT,
    outs_when_up INT,
    on_1b BIGINT,
    on_2b BIGINT,
    on_3b BIGINT,
    inning INT,
    inning_topbot TEXT,
    plate_x DOUBLE PRECISION,
    plate_z DOUBLE PRECISION,
    zone INT,
    sz_top DOUBLE PRECISION,
    sz_bot DOUBLE PRECISION,
    release_speed DOUBLE PRECISION,
    release_spin DOUBLE PRECISION,
    pfx_x DOUBLE PRECISION,
    pfx_z DOUBLE PRECISION,
    effective_speed DOUBLE PRECISION,
    description TEXT,
    events TEXT,
    estimated_woba_using_speedangle DOUBLE PRECISION,
    delta_run_exp DOUBLE PRECISION,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pitches_raw_game_date ON pitches_raw(game_date);
CREATE INDEX IF NOT EXISTS idx_pitches_raw_catcher ON pitches_raw(catcher_id);
CREATE INDEX IF NOT EXISTS idx_pitches_raw_pitcher ON pitches_raw(pitcher);
CREATE INDEX IF NOT EXISTS idx_pitches_raw_batter ON pitches_raw(batter);
CREATE INDEX IF NOT EXISTS idx_pitches_raw_context
    ON pitches_raw(game_year, balls, strikes, stand, p_throws, pitch_type);

CREATE TABLE IF NOT EXISTS pitch_features (
    pitch_uid TEXT PRIMARY KEY REFERENCES pitches_raw(pitch_uid) ON DELETE CASCADE,
    count_state TEXT,
    count_bucket TEXT,
    base_state TEXT,
    outs_state TEXT,
    platoon_flag TEXT,
    zone_bucket_9 TEXT,
    zone_bucket_25 TEXT,
    edge_flag BOOLEAN,
    chase_zone_flag BOOLEAN,
    waste_zone_flag BOOLEAN,
    prev_pitch_type_1 TEXT,
    prev_pitch_type_2 TEXT,
    same_as_prev_pitch BOOLEAN,
    same_tunnel_family BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pitcher_candidate_pitch_sets (
    pitcher BIGINT NOT NULL,
    count_bucket TEXT NOT NULL,
    base_state TEXT NOT NULL,
    outs_state TEXT NOT NULL,
    platoon_flag TEXT NOT NULL,
    pitch_type TEXT NOT NULL,
    pitch_name TEXT,
    pitch_type_group TEXT NOT NULL,
    zone_bucket_25 TEXT NOT NULL,
    pitch_type_usage DOUBLE PRECISION NOT NULL,
    location_usage DOUBLE PRECISION NOT NULL,
    candidate_prob DOUBLE PRECISION NOT NULL,
    pitch_count INT NOT NULL,
    target_plate_x DOUBLE PRECISION,
    target_plate_z DOUBLE PRECISION,
    sz_top DOUBLE PRECISION,
    sz_bot DOUBLE PRECISION,
    release_speed DOUBLE PRECISION,
    release_spin DOUBLE PRECISION,
    pfx_x DOUBLE PRECISION,
    pfx_z DOUBLE PRECISION,
    effective_speed DOUBLE PRECISION,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (
        pitcher, count_bucket, base_state, outs_state, platoon_flag, pitch_type, zone_bucket_25
    )
);

CREATE INDEX IF NOT EXISTS idx_pitcher_candidate_pitch_sets_context
    ON pitcher_candidate_pitch_sets(pitcher, count_bucket, base_state, outs_state, platoon_flag);

CREATE TABLE IF NOT EXISTS catcher_pitch_scores (
    pitch_uid TEXT PRIMARY KEY REFERENCES pitches_raw(pitch_uid) ON DELETE CASCADE,
    catcher_id BIGINT,
    pitcher BIGINT,
    batter BIGINT,
    pitcher_id BIGINT,
    batter_id BIGINT,
    game_pk BIGINT,
    game_date DATE,
    game_year INT,
    expected_rv_actual DOUBLE PRECISION,
    expected_rv_baseline DOUBLE PRECISION,
    dva DOUBLE PRECISION,
    execution_gap DOUBLE PRECISION,
    actual_context_sample_size INT,
    surviving_candidate_count INT,
    fallback_tier TEXT,
    outperformed_baseline BOOLEAN,
    receiving_bonus DOUBLE PRECISION DEFAULT 0,
    final_pitch_score DOUBLE PRECISION,
    model_version TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_catcher_pitch_scores_catcher
    ON catcher_pitch_scores(catcher_id);
CREATE INDEX IF NOT EXISTS idx_catcher_pitch_scores_catcher_game_date
    ON catcher_pitch_scores(catcher_id, game_date);
CREATE INDEX IF NOT EXISTS idx_catcher_pitch_scores_game_date
    ON catcher_pitch_scores(game_date);
CREATE INDEX IF NOT EXISTS idx_catcher_pitch_scores_game_year_catcher
    ON catcher_pitch_scores(game_year, catcher_id, game_date);

CREATE TABLE IF NOT EXISTS catcher_game_scores (
    catcher_id BIGINT NOT NULL,
    game_pk BIGINT NOT NULL,
    game_date DATE NOT NULL,
    game_year INT,
    pitches_scored INT NOT NULL,
    total_dva DOUBLE PRECISION NOT NULL,
    total_receiving_bonus DOUBLE PRECISION NOT NULL,
    total_cdri DOUBLE PRECISION NOT NULL,
    avg_execution_gap DOUBLE PRECISION,
    PRIMARY KEY (catcher_id, game_pk)
);

CREATE INDEX IF NOT EXISTS idx_catcher_game_scores_game_date
    ON catcher_game_scores(game_date);
CREATE INDEX IF NOT EXISTS idx_catcher_game_scores_catcher_game_date
    ON catcher_game_scores(catcher_id, game_date);
CREATE INDEX IF NOT EXISTS idx_catcher_game_scores_game_year_catcher
    ON catcher_game_scores(game_year, catcher_id, game_date);

CREATE TABLE IF NOT EXISTS batter_zone_profiles (
    batter BIGINT NOT NULL,
    season INT NOT NULL,
    pitch_type_group TEXT NOT NULL,
    pitcher_hand TEXT NOT NULL,
    count_bucket TEXT NOT NULL,
    zone_bucket_25 TEXT NOT NULL,
    pitches_seen INT NOT NULL,
    avg_delta_run_exp DOUBLE PRECISION,
    avg_estimated_woba DOUBLE PRECISION,
    PRIMARY KEY (
        batter, season, pitch_type_group, pitcher_hand, count_bucket, zone_bucket_25
    )
);

CREATE TABLE IF NOT EXISTS model_registry (
    model_version TEXT PRIMARY KEY,
    model_type TEXT NOT NULL,
    trained_on_start DATE,
    trained_on_end DATE,
    feature_list JSONB,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_metadata (
    player_id BIGINT NOT NULL,
    season INT NOT NULL,
    full_name TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    team_id BIGINT,
    team_name TEXT,
    team_abbr TEXT,
    primary_position_code TEXT,
    primary_position_name TEXT,
    primary_position_abbr TEXT,
    bats TEXT,
    throws TEXT,
    active BOOLEAN DEFAULT FALSE,
    is_catcher BOOLEAN DEFAULT FALSE,
    is_selectable BOOLEAN DEFAULT FALSE,
    headshot_url TEXT,
    dropdown_label TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, season)
);

CREATE INDEX IF NOT EXISTS idx_player_metadata_selectable
    ON player_metadata(season, is_selectable);
CREATE INDEX IF NOT EXISTS idx_player_metadata_team
    ON player_metadata(season, team_abbr);

CREATE TABLE IF NOT EXISTS player_identity (
    key_person TEXT PRIMARY KEY,
    key_uuid TEXT,
    key_mlbam BIGINT,
    key_retro TEXT,
    key_bbref TEXT,
    key_bbref_minors TEXT,
    key_fangraphs TEXT,
    key_npb TEXT,
    key_wikidata TEXT,
    name_first TEXT,
    name_last TEXT,
    name_given TEXT,
    name_suffix TEXT,
    name_matrilineal TEXT,
    name_nick TEXT,
    full_name TEXT NOT NULL,
    birth_year INT,
    birth_month INT,
    birth_day INT,
    pro_played_first INT,
    pro_played_last INT,
    mlb_played_first INT,
    mlb_played_last INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_identity_key_mlbam
    ON player_identity(key_mlbam);
CREATE INDEX IF NOT EXISTS idx_player_identity_full_name
    ON player_identity(full_name);

CREATE TABLE IF NOT EXISTS player_id_crosswalk (
    player_id BIGINT PRIMARY KEY,
    key_mlbam BIGINT,
    key_bbref TEXT,
    key_fangraphs TEXT,
    key_retro TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS catcher_public_metrics (
    catcher_id BIGINT NOT NULL,
    season INT NOT NULL,
    team_id BIGINT,
    team_name TEXT,
    team_abbr TEXT,
    framing_pitches INT,
    framing_runs DOUBLE PRECISION,
    framing_strike_rate DOUBLE PRECISION,
    blocking_pitches INT,
    blocking_runs DOUBLE PRECISION,
    blocks_above_average DOUBLE PRECISION,
    expected_pbwp DOUBLE PRECISION,
    pop_time_2b DOUBLE PRECISION,
    pop_time_2b_cs DOUBLE PRECISION,
    pop_time_2b_sb DOUBLE PRECISION,
    pop_time_3b DOUBLE PRECISION,
    exchange_time DOUBLE PRECISION,
    max_effective_arm DOUBLE PRECISION,
    pop_2b_attempts INT,
    arm_overall DOUBLE PRECISION,
    max_arm_strength DOUBLE PRECISION,
    total_throws INT,
    source_note TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (catcher_id, season)
);

CREATE INDEX IF NOT EXISTS idx_catcher_public_metrics_season
    ON catcher_public_metrics(season);

CREATE TABLE IF NOT EXISTS catcher_season_summary (
    catcher_id BIGINT NOT NULL,
    season INT NOT NULL,
    pitches INT NOT NULL,
    games_scored INT NOT NULL DEFAULT 0,
    total_dva DOUBLE PRECISION NOT NULL,
    avg_dva DOUBLE PRECISION NOT NULL,
    avg_execution_gap DOUBLE PRECISION,
    avg_expected_rv_actual DOUBLE PRECISION,
    outperform_rate DOUBLE PRECISION,
    hitter_friendly_pitches INT,
    hitter_friendly_avg_dva DOUBLE PRECISION,
    hitter_friendly_outperform_rate DOUBLE PRECISION,
    pitcher_friendly_pitches INT,
    pitcher_friendly_avg_dva DOUBLE PRECISION,
    pitcher_friendly_outperform_rate DOUBLE PRECISION,
    putaway_pitches INT,
    putaway_avg_dva DOUBLE PRECISION,
    putaway_outperform_rate DOUBLE PRECISION,
    damage_count_pitches INT,
    damage_avoidance_avg_dva DOUBLE PRECISION,
    damage_avoidance_expected_rv_actual DOUBLE PRECISION,
    count_family_alignment_rate DOUBLE PRECISION,
    pairing_avg_dva DOUBLE PRECISION,
    pairing_outperform_rate DOUBLE PRECISION,
    avg_surviving_candidate_count DOUBLE PRECISION,
    single_candidate_pct DOUBLE PRECISION,
    dropped_sparse_context_pct DOUBLE PRECISION,
    fallback_context_pct DOUBLE PRECISION,
    model_version TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (catcher_id, season)
);

CREATE INDEX IF NOT EXISTS idx_catcher_season_summary_season
    ON catcher_season_summary(season, total_dva DESC);

CREATE TABLE IF NOT EXISTS catcher_count_summaries (
    catcher_id BIGINT NOT NULL,
    season INT NOT NULL,
    split_type TEXT NOT NULL,
    split_value TEXT NOT NULL,
    pitches INT NOT NULL,
    total_dva DOUBLE PRECISION NOT NULL,
    avg_dva DOUBLE PRECISION NOT NULL,
    avg_execution_gap DOUBLE PRECISION,
    avg_expected_rv_actual DOUBLE PRECISION,
    outperform_rate DOUBLE PRECISION,
    fastball_rate DOUBLE PRECISION,
    breaker_rate DOUBLE PRECISION,
    offspeed_rate DOUBLE PRECISION,
    fastball_dva DOUBLE PRECISION,
    breaker_dva DOUBLE PRECISION,
    offspeed_dva DOUBLE PRECISION,
    actual_top_pitch_family TEXT,
    recommended_pitch_family TEXT,
    hitter_friendly_flag BOOLEAN DEFAULT FALSE,
    pitcher_friendly_flag BOOLEAN DEFAULT FALSE,
    putaway_flag BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (catcher_id, season, split_type, split_value)
);

CREATE INDEX IF NOT EXISTS idx_catcher_count_summaries_lookup
    ON catcher_count_summaries(catcher_id, season, split_type);

CREATE TABLE IF NOT EXISTS catcher_pitch_type_summaries (
    catcher_id BIGINT NOT NULL,
    season INT NOT NULL,
    pitch_type TEXT NOT NULL,
    pitch_family TEXT,
    pitches INT NOT NULL,
    total_dva DOUBLE PRECISION NOT NULL,
    avg_dva DOUBLE PRECISION NOT NULL,
    avg_execution_gap DOUBLE PRECISION,
    avg_expected_rv_actual DOUBLE PRECISION,
    outperform_rate DOUBLE PRECISION,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (catcher_id, season, pitch_type)
);

CREATE INDEX IF NOT EXISTS idx_catcher_pitch_type_summaries_lookup
    ON catcher_pitch_type_summaries(catcher_id, season);

CREATE TABLE IF NOT EXISTS catcher_pairing_summaries (
    catcher_id BIGINT NOT NULL,
    season INT NOT NULL,
    pitcher_id BIGINT NOT NULL,
    pitches INT NOT NULL,
    total_dva DOUBLE PRECISION NOT NULL,
    avg_dva DOUBLE PRECISION NOT NULL,
    avg_execution_gap DOUBLE PRECISION,
    avg_expected_rv_actual DOUBLE PRECISION,
    outperform_rate DOUBLE PRECISION,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (catcher_id, season, pitcher_id)
);

CREATE INDEX IF NOT EXISTS idx_catcher_pairing_summaries_lookup
    ON catcher_pairing_summaries(catcher_id, season, pitches DESC);

CREATE TABLE IF NOT EXISTS catcher_matchup_summaries (
    catcher_id BIGINT NOT NULL,
    season INT NOT NULL,
    stand TEXT NOT NULL,
    p_throws TEXT NOT NULL,
    matchup_label TEXT NOT NULL,
    pitches INT NOT NULL,
    total_dva DOUBLE PRECISION NOT NULL,
    avg_dva DOUBLE PRECISION NOT NULL,
    avg_execution_gap DOUBLE PRECISION,
    outperform_rate DOUBLE PRECISION,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (catcher_id, season, stand, p_throws)
);

CREATE INDEX IF NOT EXISTS idx_catcher_matchup_summaries_lookup
    ON catcher_matchup_summaries(catcher_id, season);

CREATE TABLE IF NOT EXISTS catcher_grade_outputs (
    catcher_id BIGINT NOT NULL,
    season INT NOT NULL,
    overall_game_calling_score DOUBLE PRECISION,
    overall_game_calling_label TEXT,
    count_leverage_score DOUBLE PRECISION,
    count_leverage_label TEXT,
    putaway_count_score DOUBLE PRECISION,
    putaway_count_label TEXT,
    damage_avoidance_score DOUBLE PRECISION,
    damage_avoidance_label TEXT,
    pitch_mix_synergy_score DOUBLE PRECISION,
    pitch_mix_synergy_label TEXT,
    receiving_support_score DOUBLE PRECISION,
    receiving_support_label TEXT,
    formula_notes TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (catcher_id, season)
);

CREATE INDEX IF NOT EXISTS idx_catcher_grade_outputs_season
    ON catcher_grade_outputs(season, overall_game_calling_score DESC);

CREATE TABLE IF NOT EXISTS dva_scoring_diagnostics (
    season INT NOT NULL,
    model_version TEXT NOT NULL,
    eligible_pitches INT NOT NULL,
    scored_pitches INT NOT NULL,
    dropped_sparse_context_pitches INT NOT NULL,
    dropped_sparse_context_pct DOUBLE PRECISION NOT NULL,
    single_candidate_context_pct DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (season, model_version)
);
