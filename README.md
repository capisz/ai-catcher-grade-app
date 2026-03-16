# catcher-intel

`catcher-intel` is a public-data baseball decision product for catcher evaluation and live matchup support. It scores observed MLB pitch decisions from Statcast, compares them to realistic pitcher-specific alternatives, and layers in public catcher defense signals such as framing, blocking, pop time, and arm strength.

## Product modes

- `Scouting mode`
  - season-level catcher evaluation with grades, exact-count matrix, pitch-type performance, pairings, and support metrics
- `Game mode`
  - live or near-live matchup context with pitcher-specific recommendation options, confidence, and freshness signals
- `Research mode`
  - advanced board filters, side-by-side comparison, export links, sharable URL state, and report downloads

## Repo layout

- `apps/web`: Next.js Scouting, Game, and Research mode UI
- `apps/api`: FastAPI entrypoint
- `services/ingestion`: Statcast ingestion scripts
- `services/modeling`: feature loading, DVA scoring, metadata refresh, public metric refresh, summary rebuild
- `packages/contracts`: shared TypeScript API contracts
- `packages/python/catcher_intel`: shared Python modules for API, feature engineering, public data, summaries, and grading
- `sql/schema.sql`: Postgres schema

## Public data sources

- `pybaseball.statcast()` for pitch-level Statcast rows
- Chadwick Register `data/people-*.csv` shards for stable player identity keyed by MLBAM
- MLB Stats API for player metadata, active rosters, handedness, teams, and headshots
- Baseball Savant public leaderboards for catcher framing, blocking, pop time, and arm strength

For Chadwick identity, the primary source in this repo is:

- `data/external/register/data/people-0.csv`
- `data/external/register/data/people-1.csv`
- ...
- `data/external/register/data/people-f.csv`

`links.csv` and `names.csv` are not used as the primary identity source here.

## Current scoring approach

The app stays in an interpretable first-pass framework. It does not try to infer hidden catcher intent.

### Pitch scoring

Each pitch is one decision record.

- `expected_rv_actual`
  - contextual mean `delta_run_exp` for the actual pitch choice
- `expected_rv_baseline`
  - weighted average over realistic pitcher-specific alternatives in the same context
- `dva = expected_rv_baseline - expected_rv_actual`
- `execution_gap = delta_run_exp - expected_rv_actual`
- `final_pitch_score = dva`
- `receiving_bonus = 0` for now

### Tiered fallback logic

`services/modeling/score_dva.py` scores pitches in these tiers:

1. exact `count_state` + `base_state` + `platoon_flag` + `zone_bucket_25`
2. `count_bucket` + `base_state` + `platoon_flag` + `zone_bucket_25`
3. `count_bucket` + `base_state` + `platoon_flag` + `zone_bucket_9`
4. `count_bucket` + `base_state` + `platoon_flag`

Candidate usage keeps the same public-data notebook logic:

- minimum baseline sample size: `5`
- minimum pitcher candidate count: `3`
- minimum candidate probability: `0.05`
- candidate probabilities are renormalized after filtering

The scorer tracks:

- `actual_context_sample_size`
- `surviving_candidate_count`
- `fallback_tier`
- `outperformed_baseline`

## Summary outputs

Season summary tables now support:

- DVA by `count_bucket`
- DVA by exact `count_state`
- DVA by `pitch_type`
- DVA by pitcher-catcher pairing
- DVA by batter/pitcher handedness matchup
- hitter-friendly vs pitcher-friendly count splits
- recommended pitch family tendencies by count
- outperformance rate versus weighted baseline
- execution-gap separation from decision quality
- 5x5 strike-zone location summaries from scored pitch rows

## Grade formulas

The grading code is transparent in `packages/python/catcher_intel/src/catcher_intel/grading.py`.

- `Overall Game Calling Grade`
  - 45% avg DVA, 20% baseline outperformance rate, 20% hitter-friendly count avg DVA, 15% put-away count avg DVA
- `Count Leverage Grade`
  - 65% hitter-friendly count avg DVA, 35% hitter-friendly outperformance rate
- `Put-Away Count Grade`
  - 70% put-away count avg DVA, 30% put-away outperformance rate
- `Damage Avoidance Grade`
  - 55% lower-is-better expected run value in damage counts, 45% damage-count avg DVA
- `Pitch Mix Synergy Grade`
  - 40% count-family alignment rate, 40% pitcher-pairing avg DVA, 20% pitcher-pairing outperformance rate
- `Receiving Support Grade`
  - 40% public framing runs, 25% blocking runs, 20% arm overall, 15% lower-is-better pop time to second

All grades are percentile-based and mapped onto a 20-80 scale.

Qualification and stability rules:

- latest default season comes from the latest sufficiently populated scored season, not the current calendar year
- grade normalization uses qualified catchers from the selected scored season
- stable season threshold: `500` pitches and `20` scored games
- dashboard sample badge:
  - `High stability`: `1500+` pitches and `45+` games
  - `Stable`: `800+` pitches and `25+` games
  - `Limited sample`: `300+` pitches and `10+` games
  - `Low sample`: below those marks
- receiving grades stay null when public receiving metrics are unavailable

## Schema additions

`sql/schema.sql` now includes:

- `player_metadata`
- `player_identity`
- `player_id_crosswalk`
- `catcher_public_metrics`
- `catcher_season_summary`
- `catcher_count_summaries`
- `catcher_pitch_type_summaries`
- `catcher_pairing_summaries`
- `catcher_matchup_summaries`
- `catcher_grade_outputs`
- `dva_scoring_diagnostics`

It also adds query-oriented indexes and new columns on `catcher_pitch_scores` / `catcher_game_scores`.

## Setup

### Python

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip
python3 -m pip install -e .
```

### Frontend

```bash
pnpm install
```

### Environment

```bash
cp .env.example .env
export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/catcher_intel
export API_BASE_URL=http://127.0.0.1:8000
```

Frontend transport precedence:

- `INTERNAL_API_URL` for a server-only override
- `API_BASE_URL` as the recommended single source of truth
- `NEXT_PUBLIC_API_URL` as a supported fallback alias
- default fallback: `http://127.0.0.1:8000`

The Next.js app always fetches through `/api/backend`, and that proxy forwards to the configured backend target above. If you change the backend port in development, update `API_BASE_URL` to the same port so the target does not drift.

## Live-data-ready API surfaces

FastAPI now exposes:

- `GET /app/metadata`
  - selected/default season resolution, team filters, freshness timestamps, updated-through date, model version, and season coverage notes
- `GET /catchers`
  - season and optional `team` filtering
- `GET /catchers/leaderboard`
  - season, optional `team`, `min_pitches`, and optional date range filtering
- `GET /catchers/{catcher_id}/location-summary`
  - real 5x5 location heatmap cells from scored pitch rows
- existing catcher detail, count, pitch-type, pairing, and recommendation endpoints remain in place

## Exact run order

### 1. Start Postgres

Use your existing local Postgres:

```bash
postgresql://postgres:postgres@localhost:5433/catcher_intel
```

### 2. Ingest Statcast into `pitches_raw`

```bash
.venv/bin/python services/ingestion/ingest_statcast.py \
  --start-date 2025-04-01 \
  --end-date 2025-04-30 \
  --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel
```

### 3. Load derived pitch features into `pitch_features`

```bash
.venv/bin/python services/modeling/load_features.py \
  --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel
```

### 4. Load Chadwick identity from the people shard files

```bash
.venv/bin/python services/ingestion/load_chadwick_identity.py \
  --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel
```

This loader scans:

- `data/external/register/data/people-*.csv`

It does not use `links.csv` or `names.csv` as the primary identity input.

### 5. Refresh player metadata and selectable catcher list

```bash
.venv/bin/python services/modeling/refresh_player_metadata.py \
  --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel \
  --season 2025
```

### 6. Refresh public catcher metrics

```bash
.venv/bin/python services/modeling/refresh_catcher_metrics.py \
  --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel \
  --season 2025
```

### 7. Rescore DVA

```bash
.venv/bin/python services/modeling/score_dva.py \
  --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel \
  --season 2025
```

The scorer prints:

- raw candidate pitches
- baseline rows
- scored pitches
- `catcher_game_scores` rows written
- dropped sparse context percent
- single-candidate context percent
- per-tier fallback counts

### 8. Rebuild catcher summaries and grades

```bash
.venv/bin/python services/modeling/rebuild_catcher_summaries.py \
  --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel \
  --season 2025
```

### 8b. One-command latest-season refresh

```bash
.venv/bin/python services/modeling/refresh_latest_scored_data.py \
  --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel
```

Or through `pnpm`:

```bash
pnpm refresh:latest-season -- --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel
```

This runs player metadata refresh, public catcher metrics refresh, DVA scoring, and summary rebuild for the latest season present in `pitches_raw`.

### 9. Run the API

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/catcher_intel \
python3 -m uvicorn apps.api.main:app --reload --app-dir . --host 127.0.0.1 --port 8000
```

### 10. Run the frontend

```bash
API_BASE_URL=http://127.0.0.1:8000 pnpm --filter web dev
```

Open [http://localhost:3000](http://localhost:3000).

If you need a different backend port, change both commands together. Example:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/catcher_intel \
python3 -m uvicorn apps.api.main:app --reload --app-dir . --host 127.0.0.1 --port 8010

API_BASE_URL=http://127.0.0.1:8010 pnpm --filter web dev
```

The frontend no longer silently falls back to shared demo values. If the API or scored summaries are missing, the dashboard shows an explicit real-data error state instead of substituting fake catcher metrics.

### 11. Validate dashboard distinctness

```bash
.venv/bin/python services/modeling/validate_dashboard_metrics.py \
  --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel \
  --season 2025 \
  --top-n 20
```

## API endpoints

- `GET /catchers`
  - active/selectable catcher list for the season dropdown
- `GET /catchers/leaderboard`
  - query params: `min_pitches`, `season`, `date_from`, `date_to`
- `GET /catchers/{catcher_id}`
  - query params: `season`
- `GET /catchers/{catcher_id}/pairings`
  - query params: `season`, `limit`
- `GET /catchers/{catcher_id}/counts`
  - query params: `season`
- `GET /catchers/{catcher_id}/pitch-types`
  - query params: `season`

Example:

```bash
curl "http://127.0.0.1:8000/catchers/leaderboard?season=2025&min_pitches=50"
curl "http://127.0.0.1:8000/catchers/672275?season=2025"
```

## Frontend routes

- `/`
  - main catcher scouting dashboard
- `/leaderboard`
  - season leaderboard with filters
- `/catcher/{id}`
  - redirects to the main dashboard selection

## Useful scripts

From the repo root:

```bash
pnpm load:chadwick -- --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel
pnpm refresh:players -- --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel --season 2025
pnpm refresh:catcher-metrics -- --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel --season 2025
pnpm score:dva -- --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel --season 2025
pnpm rebuild:summaries -- --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel --season 2025
pnpm validate:dashboard -- --db-url postgresql://postgres:postgres@localhost:5433/catcher_intel --season 2025
pnpm dev:api
pnpm dev:web
```

## Public-data limitations

This app is a real public-data catcher evaluation tool, but it still cannot measure true hidden intent.

- Public Statcast shows what was thrown, not what the catcher asked for on PitchCom.
- We cannot separate pitcher shake-offs from catcher calls.
- We do not have private scouting reports, pitcher comfort plans, or pre-series sequencing plans.
- Public framing/blocking/throwing metrics are seasonal rollups, not pitch-by-pitch catcher intent signals.
- The current DVA model is contextual and interpretable, but not a full counterfactual pitch-calling truth model.

So the app evaluates observed pitch-choice quality and public receiving support, not secret internal game plans.
# ai-catcher-grade-app
