import type {
  CatcherDetailResponse,
  CatchersResponse,
  PairingsResponse,
  RecommendationResponse,
} from "@catcher-intel/contracts";
import Image from "next/image";

import { ApiDebugPanel } from "@/components/api-debug-panel";
import { DataFreshnessPanel } from "@/components/data-freshness-panel";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import { PairingDvaChart } from "@/components/pairing-dva-chart";
import { ProductStatusStrip } from "@/components/product-status-strip";
import { RecommendationOptionBoard } from "@/components/recommendation-option-board";
import { RecommendationRvChart } from "@/components/recommendation-rv-chart";
import { SampleStabilityBadge } from "@/components/sample-stability-badge";
import { SectionCard } from "@/components/section-card";
import { LoadingForm } from "@/components/ui/loading-form";
import { LoadingLink } from "@/components/ui/loading-link";
import {
  ApiRequestError,
  getApiHealth,
  getApiTransport,
  getAppMetadata,
  getAtbatRecommendation,
  getCatcherDetail,
  getCatcherPairings,
  getCatchers,
} from "@/lib/api";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readString(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }
  return value ?? fallback;
}

function readNumber(value: string | string[] | undefined) {
  const text = readString(value, "").trim();
  if (!text) {
    return undefined;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatSigned(value: number | null | undefined, digits = 4) {
  if (value == null) {
    return "--";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatPct(value: number | null | undefined) {
  if (value == null) {
    return "--";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown data loading error.";
}

function debugErrorDetail(error: unknown) {
  if (error instanceof ApiRequestError) {
    return error.status == null
      ? error.message
      : `HTTP ${error.status} | ${error.message}`;
  }
  return errorMessage(error);
}

function buildHref(pathname: string, params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && String(value).trim()) {
      search.set(key, String(value));
    }
  });
  return `${pathname}?${search.toString()}`;
}

function confidenceLabel(recommendation: RecommendationResponse | null) {
  if (!recommendation) {
    return "Unavailable";
  }
  if (recommendation.candidate_count >= 8) {
    return "High confidence";
  }
  if (recommendation.candidate_count >= 4) {
    return "Usable confidence";
  }
  if (recommendation.candidate_count >= 2) {
    return "Thin confidence";
  }
  return "Very thin confidence";
}

function recommendationSummary(recommendation: RecommendationResponse | null) {
  const top = recommendation?.options[0];
  if (!recommendation || !top) {
    return "No recommendation survived the current public-data context filters.";
  }

  return `${top.pitch_type} is preferred because it carries the best observed expected run value in this pitcher-specific context while still reflecting real historical usage (${formatPct(top.usage_share)}).`;
}

export default async function MatchupExplorerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedSeason = readNumber(params.season);
  const requestedTeam = readString(params.team, "").toUpperCase();
  const stand = readString(params.stand, "R").toUpperCase();
  const pThrows = readString(params.p_throws, "R").toUpperCase();
  const balls = readNumber(params.balls) ?? 0;
  const strikes = readNumber(params.strikes) ?? 0;
  const outsWhenUp = readNumber(params.outs_when_up) ?? 0;
  const baseState = readString(params.base_state, "000");
  const batterId = readNumber(params.batter_id);
  const leverageBucket = readString(params.leverage_bucket, "standard");
  const prevPitchType1 = readString(params.prev_pitch_type_1, "");
  const prevPitchType2 = readString(params.prev_pitch_type_2, "");
  const apiTransport = await getApiTransport();

  const healthStatus = await getApiHealth()
    .then(() => ({
      label: "API health",
      status: "ok" as const,
      detail: "Reachable via /health",
    }))
    .catch((error) => ({
      label: "API health",
      status: "error" as const,
      detail: debugErrorDetail(error),
    }));

  let metadata;
  try {
    metadata = await getAppMetadata({ season: requestedSeason });
  } catch (error) {
    return (
      <EmptyStatePanel
        eyebrow="Game Mode Offline"
        title="The matchup explorer cannot load metadata"
        description={errorMessage(error)}
        detail={`Targeted backend: ${apiTransport.backendBaseUrl} (${apiTransport.configuredFrom}). Start the API there or update API_BASE_URL / NEXT_PUBLIC_API_URL before retrying.`}
        tone="caution"
        action={
          <ApiDebugPanel
            transport={apiTransport}
            items={[
              healthStatus,
              {
                label: "App metadata",
                status: "error",
                detail: debugErrorDetail(error),
              },
            ]}
            defaultOpen
          />
        }
      />
    );
  }

  let catchers: CatchersResponse;
  try {
    catchers = await getCatchers({
      season: metadata.selected_season,
      team: requestedTeam || undefined,
    });
  } catch (error) {
    return (
      <EmptyStatePanel
        eyebrow="Game Mode Offline"
        title="Matchup explorer cannot reach the catcher list"
        description={errorMessage(error)}
        detail={`Targeted backend: ${apiTransport.backendBaseUrl} (${apiTransport.configuredFrom}). Start the API there or update API_BASE_URL / NEXT_PUBLIC_API_URL before retrying.`}
        tone="caution"
        action={
          <ApiDebugPanel
            transport={apiTransport}
            items={[
              healthStatus,
              {
                label: "Catchers",
                status: "error",
                detail: debugErrorDetail(error),
              },
            ]}
            defaultOpen
          />
        }
      />
    );
  }

  if (catchers.catchers.length === 0) {
    return (
      <EmptyStatePanel
        eyebrow="No Catchers Available"
        title="No catcher rows match this team-season filter"
        description={`Season ${metadata.selected_season}${requestedTeam ? ` for team ${requestedTeam}` : ""} has no live catcher options for Game mode.`}
        detail={metadata.season_coverage_note}
        tone="caution"
      />
    );
  }

  const requestedCatcherId = readNumber(params.catcher_id);
  const selectedCatcher =
    catchers.catchers.find((catcher) => catcher.catcher_id === requestedCatcherId) ??
    catchers.catchers[0];
  const selectedCatcherId = selectedCatcher?.catcher_id;

  if (!selectedCatcherId) {
    return (
      <EmptyStatePanel
        eyebrow="No Scored Data"
        title="No catcher seasons are ready for game mode"
        description={`Season ${metadata.selected_season} does not currently have real scored catcher options for the matchup explorer.`}
        detail="Rebuild summaries for a populated season or select a different scored season."
      />
    );
  }

  let catcherDetail: CatcherDetailResponse;
  try {
    catcherDetail = await getCatcherDetail(selectedCatcherId, { season: metadata.selected_season });
  } catch (error) {
    return (
      <EmptyStatePanel
        eyebrow="Catcher Not Found"
        title="The selected catcher does not have a usable game-mode row"
        description={errorMessage(error)}
        detail="Choose a different catcher or switch to a season with real summary data."
        tone="caution"
      />
    );
  }

  let pairings: PairingsResponse;
  try {
    pairings = await getCatcherPairings(selectedCatcherId, {
      season: metadata.selected_season,
      limit: 8,
    });
  } catch (error) {
    return (
      <EmptyStatePanel
        eyebrow="Pairings Unavailable"
        title="Pitcher-catcher pairings could not be loaded"
        description={errorMessage(error)}
        detail="Game mode uses real pairing rows to anchor the pitcher side of the recommendation view."
        tone="caution"
      />
    );
  }

  const selectedPitcherId = readNumber(params.pitcher_id) ?? pairings.pairings[0]?.pitcher_id;

  if (!selectedPitcherId) {
    return (
      <EmptyStatePanel
        eyebrow="Insufficient Real Data"
        title="No paired pitchers are available for this catcher-season"
        description="The recommendation workbench uses real pitcher-catcher context. This catcher-season does not have pairing rows yet."
        detail="Try another catcher or a more populated season."
        tone="caution"
      />
    );
  }

  let recommendationError: unknown;
  let recommendation: RecommendationResponse | null = null;

  try {
    recommendation = await getAtbatRecommendation({
      catcherId: selectedCatcherId,
      pitcherId: selectedPitcherId,
      batterId,
      stand: stand === "L" || stand === "S" ? stand : "R",
      pThrows: pThrows === "L" ? "L" : "R",
      balls: Math.max(0, Math.min(balls, 3)),
      strikes: Math.max(0, Math.min(strikes, 2)),
      outsWhenUp: Math.max(0, Math.min(outsWhenUp, 2)),
      baseState: /^[01]{3}$/.test(baseState) ? baseState : "000",
      prevPitchType1: prevPitchType1 || undefined,
      prevPitchType2: prevPitchType2 || undefined,
    });
  } catch (error) {
    recommendationError = error;
  }

  const debugItems = [
    healthStatus,
    {
      label: "App metadata",
      status: "ok" as const,
      detail: `${metadata.selected_season} | ${metadata.season_type_label}`,
    },
    {
      label: "Catchers",
      status: catchers.catchers.length > 0 ? ("ok" as const) : ("warning" as const),
      detail: `${catchers.catchers.length} catcher options for ${catchers.season}`,
    },
    {
      label: "Catcher detail",
      status: "ok" as const,
      detail: `${catcherDetail.identity.catcher_name} | ${catcherDetail.total_pitches.toLocaleString()} pitches`,
    },
    {
      label: "Pairings",
      status: pairings.pairings.length > 0 ? ("ok" as const) : ("warning" as const),
      detail: `${pairings.pairings.length} pairing rows for catcher ${selectedCatcherId}`,
    },
    recommendationError
      ? {
          label: "Recommendation",
          status: "error" as const,
          detail: debugErrorDetail(recommendationError),
        }
      : {
          label: "Recommendation",
          status: recommendation && recommendation.options.length > 0 ? ("ok" as const) : ("warning" as const),
          detail: recommendation
            ? `${recommendation.options.length} recommendation options for pitcher ${selectedPitcherId}`
            : "No recommendation payload",
        },
  ];

  const safeStand = stand === "L" || stand === "S" ? stand : "R";
  const safePThrows = pThrows === "L" ? "L" : "R";
  const safeBaseState = /^[01]{3}$/.test(baseState) ? baseState : "000";
  const selectedSeason = metadata.selected_season;

  const buildQueryHref = (overrides: Record<string, string | number | undefined>) =>
    buildHref("/matchup-explorer", {
      season: selectedSeason,
      team: requestedTeam || undefined,
      catcher_id: selectedCatcherId,
      pitcher_id: overrides.pitcher_id ?? selectedPitcherId,
      batter_id: overrides.batter_id ?? batterId,
      stand: overrides.stand ?? safeStand,
      p_throws: overrides.p_throws ?? safePThrows,
      balls: overrides.balls ?? balls,
      strikes: overrides.strikes ?? strikes,
      outs_when_up: overrides.outs_when_up ?? outsWhenUp,
      base_state: overrides.base_state ?? safeBaseState,
      leverage_bucket: overrides.leverage_bucket ?? leverageBucket,
      prev_pitch_type_1: (overrides.prev_pitch_type_1 ?? prevPitchType1) || undefined,
      prev_pitch_type_2: (overrides.prev_pitch_type_2 ?? prevPitchType2) || undefined,
    });

  return (
    <div className="space-y-8">
      <section className="card relative overflow-hidden rounded-[1.6rem] px-5 py-5 sm:px-6 sm:py-6 lg:px-7">
        <div className="hero-wash pointer-events-none absolute inset-x-0 top-0 h-24" />
        <div className="relative grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <div className="space-y-6">
            <div>
              <div className="label-kicker">Game Mode</div>
              <h1 className="mt-4 max-w-3xl font-serif text-[2.45rem] leading-[0.98] text-ink sm:text-[3.05rem]">
                Live-context recommendation support from real public baseball data.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-8 text-muted">
                Game mode is for current matchup context, not season board-reading. It uses
                pitcher-specific candidate options, public context filters, and observed expected
                run value. It does not know private PitchCom or hidden sign intent.
              </p>
            </div>

            <ProductStatusStrip
              metadata={metadata}
              sampleLabel={catcherDetail.diagnostics.stability_label}
              qualified={catcherDetail.diagnostics.qualified_for_grades}
            />

            <LoadingForm
              action="/matchup-explorer"
              className="shell-panel rounded-[1.2rem] p-4"
              loadingMessage="Loading game mode..."
              loadingSubtitle="Refreshing catcher, season, and team context."
            >
              <input type="hidden" name="pitcher_id" value={selectedPitcherId} />
              <input type="hidden" name="batter_id" value={batterId ?? ""} />
              <input type="hidden" name="stand" value={safeStand} />
              <input type="hidden" name="p_throws" value={safePThrows} />
              <input type="hidden" name="balls" value={balls} />
              <input type="hidden" name="strikes" value={strikes} />
              <input type="hidden" name="outs_when_up" value={outsWhenUp} />
              <input type="hidden" name="base_state" value={safeBaseState} />
              <input type="hidden" name="leverage_bucket" value={leverageBucket} />
              <input type="hidden" name="prev_pitch_type_1" value={prevPitchType1} />
              <input type="hidden" name="prev_pitch_type_2" value={prevPitchType2} />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[minmax(0,1.2fr)_11rem_11rem_auto]">
                <label className="min-w-0 space-y-2">
                  <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    Catcher
                  </span>
                  <select
                    className="field"
                    name="catcher_id"
                    defaultValue={String(selectedCatcherId)}
                    data-auto-submit="true"
                  >
                    {catchers.catchers.map((catcher) => (
                      <option key={catcher.catcher_id} value={catcher.catcher_id}>
                        {catcher.dropdown_label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0 space-y-2">
                  <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    Season
                  </span>
                  <select
                    className="field"
                    name="season"
                    defaultValue={String(selectedSeason)}
                    data-auto-submit="true"
                  >
                    {metadata.available_seasons.map((season) => (
                      <option key={season} value={season}>
                        {season}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0 space-y-2">
                  <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    Team filter
                  </span>
                  <select
                    className="field"
                    name="team"
                    defaultValue={requestedTeam}
                    data-auto-submit="true"
                  >
                    <option value="">All teams</option>
                    {metadata.available_teams.map((team) => (
                      <option key={team.value} value={team.value}>
                        {team.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end md:col-span-2 xl:col-span-3 2xl:col-span-1">
                  <button className="button-secondary w-full px-4 py-3 text-sm">
                    Refresh context
                  </button>
                </div>
              </div>
            </LoadingForm>

            <LoadingForm
              action="/matchup-explorer"
              className="shell-panel rounded-[1.2rem] p-4"
              loadingMessage="Running matchup recommendation..."
              loadingSubtitle="Scoring pitcher-specific options for the selected count and base/out context."
            >
              <input type="hidden" name="season" value={selectedSeason} />
              <input type="hidden" name="team" value={requestedTeam} />
              <input type="hidden" name="catcher_id" value={selectedCatcherId} />
              <div className="grid gap-3 xl:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    Pitcher
                  </span>
                  <input
                    className="field"
                    type="number"
                    min="1"
                    name="pitcher_id"
                    defaultValue={selectedPitcherId}
                    placeholder="Pitcher MLBAM ID"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    Batter
                  </span>
                  <input
                    className="field"
                    type="number"
                    min="1"
                    name="batter_id"
                    defaultValue={batterId}
                    placeholder="Batter MLBAM ID (optional)"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    Batter side
                  </span>
                  <select className="field" name="stand" defaultValue={safeStand}>
                    <option value="R">Bats right</option>
                    <option value="L">Bats left</option>
                    <option value="S">Switch</option>
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    Pitcher hand
                  </span>
                  <select className="field" name="p_throws" defaultValue={safePThrows}>
                    <option value="R">Throws right</option>
                    <option value="L">Throws left</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <select className="field" name="balls" defaultValue={String(balls)}>
                  {[0, 1, 2, 3].map((value) => (
                    <option key={value} value={value}>
                      {value} balls
                    </option>
                  ))}
                </select>
                <select className="field" name="strikes" defaultValue={String(strikes)}>
                  {[0, 1, 2].map((value) => (
                    <option key={value} value={value}>
                      {value} strikes
                    </option>
                  ))}
                </select>
                <select className="field" name="outs_when_up" defaultValue={String(outsWhenUp)}>
                  {[0, 1, 2].map((value) => (
                    <option key={value} value={value}>
                      {value} outs
                    </option>
                  ))}
                </select>
                <select className="field" name="base_state" defaultValue={safeBaseState}>
                  {["000", "100", "010", "001", "110", "101", "011", "111"].map((value) => (
                    <option key={value} value={value}>
                      Base state {value}
                    </option>
                  ))}
                </select>
                <select className="field" name="leverage_bucket" defaultValue={leverageBucket}>
                  <option value="standard">Standard leverage</option>
                  <option value="medium">Medium leverage</option>
                  <option value="high">High leverage</option>
                </select>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <input
                  className="field"
                  name="prev_pitch_type_1"
                  defaultValue={prevPitchType1}
                  placeholder="Previous pitch type 1 (optional)"
                />
                <input
                  className="field"
                  name="prev_pitch_type_2"
                  defaultValue={prevPitchType2}
                  placeholder="Previous pitch type 2 (optional)"
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button className="button-primary px-5 py-3 text-sm">Run recommendation</button>
                <LoadingLink
                  href={`/?catcher_id=${selectedCatcherId}&season=${selectedSeason}&team=${requestedTeam || ""}`}
                  className="button-secondary px-4 py-3 text-sm"
                  loadingMessage="Opening scouting mode..."
                  loadingSubtitle={`Loading ${catcherDetail.identity.catcher_name}.`}
                >
                  Open scouting mode
                </LoadingLink>
                <LoadingLink
                  href={`/research?season=${selectedSeason}&team=${requestedTeam || ""}&catcher_id=${selectedCatcherId}`}
                  className="button-secondary px-4 py-3 text-sm"
                  loadingMessage="Opening research mode..."
                  loadingSubtitle="Loading export and comparison tools."
                >
                  Open research mode
                </LoadingLink>
              </div>
            </LoadingForm>
          </div>

          <aside className="panel-dark overflow-hidden rounded-[1.55rem] p-5 text-white sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {catcherDetail.identity.headshot_url ? (
                  <Image
                    src={catcherDetail.identity.headshot_url}
                    alt={catcherDetail.identity.catcher_name}
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-[1.15rem] border border-white/12 object-cover"
                  />
                ) : (
                  <div className="dark-pill flex h-24 w-24 items-center justify-center rounded-[1.15rem] text-3xl font-semibold">
                    {catcherDetail.identity.catcher_name[0]}
                  </div>
                )}
                <div>
                  <div className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-white/56">
                    Active game context
                  </div>
                  <h2 className="mt-3 font-serif text-[2rem] leading-none">
                    {catcherDetail.identity.catcher_name}
                  </h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="dark-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
                      {catcherDetail.identity.team ?? "FA"}
                    </span>
                    <span className="dark-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
                      Pitcher {selectedPitcherId}
                    </span>
                    <span className="dark-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
                      {balls}-{strikes}, {outsWhenUp} outs
                    </span>
                  </div>
                </div>
              </div>
              <SampleStabilityBadge
                label={catcherDetail.diagnostics.stability_label}
                qualified={catcherDetail.diagnostics.qualified_for_grades}
              />
            </div>

            <div className="scouting-seam mt-5" />

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="scorebug rounded-[1rem] border border-white/10 px-4 py-3">
                <div className="text-[0.64rem] uppercase tracking-[0.2em] text-white/58">
                  Confidence
                </div>
                <div className="mt-2 text-lg font-semibold">{confidenceLabel(recommendation)}</div>
                <div className="mt-2 text-sm text-white/72">
                  Candidate count drives how much weight to place on the output
                </div>
              </div>
              <div className="scorebug rounded-[1rem] border border-white/10 px-4 py-3">
                <div className="text-[0.64rem] uppercase tracking-[0.2em] text-white/58">
                  Weighted expected RV
                </div>
                <div className="numeric mt-2 text-[1.45rem] font-semibold">
                  {formatSigned(recommendation?.weighted_expected_rv, 4)}
                </div>
                <div className="mt-2 text-sm text-white/72">
                  Context baseline before picking the top option
                </div>
              </div>
              <div className="scorebug rounded-[1rem] border border-white/10 px-4 py-3">
                <div className="text-[0.64rem] uppercase tracking-[0.2em] text-white/58">
                  Candidate count
                </div>
                <div className="numeric mt-2 text-[1.45rem] font-semibold">
                  {recommendation?.candidate_count ?? 0}
                </div>
                <div className="mt-2 text-sm text-white/72">
                  Real pitch alternatives surviving context filters
                </div>
              </div>
              <div className="scorebug rounded-[1rem] border border-white/10 px-4 py-3">
                <div className="text-[0.64rem] uppercase tracking-[0.2em] text-white/58">
                  Best option
                </div>
                <div className="mt-2 text-lg font-semibold">
                  {recommendation?.options[0]?.pitch_type ?? "--"}
                </div>
                <div className="mt-2 text-sm text-white/72">
                  {recommendation?.options[0]
                    ? `${formatSigned(recommendation.options[0].expected_rv, 4)} expected RV`
                    : "No recommendation available"}
                </div>
              </div>
            </div>

            <p className="mt-5 text-sm leading-7 text-white/74">
              {recommendation?.note ??
                "Recommendation data is unavailable for this exact context. The page keeps the live context visible so missing model support is explicit."}
            </p>
          </aside>
        </div>
      </section>

      <SectionCard
        eyebrow="Live Readiness"
        title="Freshness and scoring state"
        subtitle="Game mode needs current context and honest freshness language. These cards show how recent the public-data pipeline really is."
      >
        <DataFreshnessPanel metadata={metadata} />
      </SectionCard>

      <SectionCard
        eyebrow="Pairing Shortlist"
        title="Quick-select pitcher partners"
        subtitle="Anchor the recommendation context with real pitcher-catcher pairings before adjusting count, base state, and handedness."
      >
        <div className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
          <div className="surface-panel rounded-[1.35rem] p-5">
            <PairingDvaChart rows={pairings.pairings} title="Pairing DVA snapshot" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {pairings.pairings.map((row) => {
              const active = row.pitcher_id === selectedPitcherId;
              return (
                <LoadingLink
                  key={row.pitcher_id}
                  href={buildQueryHref({ pitcher_id: row.pitcher_id })}
                  loadingMessage="Loading pairing context..."
                  loadingSubtitle={`Opening ${row.pitcher_name}.`}
                  className={[
                    "rounded-[1.1rem] border p-4 transition",
                    active
                      ? "border-accent/30 bg-surface-strong text-white shadow-[0_14px_24px_rgba(68,83,95,0.18)]"
                      : "surface-panel hover:-translate-y-0.5 hover:border-accent/24",
                  ].join(" ")}
                >
                  <div className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] opacity-70">
                    Pitcher {row.pitcher_id}
                  </div>
                  <div className="mt-3 text-lg font-semibold">{row.pitcher_name}</div>
                  <div className="mt-2 text-sm leading-6 opacity-80">
                    {row.pitches.toLocaleString()} paired pitches
                  </div>
                  <div className="numeric mt-3 text-xl font-semibold">
                    {formatSigned(row.total_dva, 3)}
                  </div>
                </LoadingLink>
              );
            })}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Recommendation Board"
        title="Recommended pitch options"
        subtitle="Observed public-data options ranked by expected run value in the selected live context."
      >
        {recommendationError ? (
          <EmptyStatePanel
            eyebrow={
              recommendationError instanceof ApiRequestError && recommendationError.status === 404
                ? "No Recommendation"
                : "Recommendation Failed"
            }
            title="This exact context is not currently scoreable"
            description={errorMessage(recommendationError)}
            detail="Adjust the pitcher, count, or base/out state. Game mode only shows real candidates that survive the current public-data context filters."
            tone="caution"
          />
        ) : recommendation ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <div className="surface-panel rounded-[1rem] px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">Count</div>
                <div className="mt-2 text-lg font-semibold text-ink">{recommendation.count_state}</div>
              </div>
              <div className="surface-panel rounded-[1rem] px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">Count bucket</div>
                <div className="mt-2 text-lg font-semibold text-ink">
                  {recommendation.count_bucket.replaceAll("_", " ")}
                </div>
              </div>
              <div className="surface-panel rounded-[1rem] px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">Base state</div>
                <div className="mt-2 text-lg font-semibold text-ink">{recommendation.base_state}</div>
              </div>
              <div className="surface-panel rounded-[1rem] px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">Outs</div>
                <div className="mt-2 text-lg font-semibold text-ink">{recommendation.outs_state}</div>
              </div>
              <div className="surface-panel rounded-[1rem] px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">Platoon</div>
                <div className="mt-2 text-lg font-semibold text-ink">
                  {recommendation.platoon_flag.replaceAll("_", " ")}
                </div>
              </div>
              <div className="surface-panel rounded-[1rem] px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">Leverage</div>
                <div className="mt-2 text-lg font-semibold text-ink">
                  {leverageBucket.replaceAll("_", " ")}
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
              <div className="surface-panel rounded-[1.25rem] p-5">
                <RecommendationRvChart options={recommendation.options} />
              </div>
              <div className="space-y-5">
                <div className="surface-panel rounded-[1.25rem] p-5">
                  <div className="label-kicker">Why this is preferred</div>
                  <p className="mt-4 text-sm leading-8 text-muted">
                    {recommendationSummary(recommendation)}
                  </p>
                  <p className="mt-3 text-sm leading-8 text-muted">
                    Confidence depends on candidate count and context coverage. When the candidate pool
                    gets thin, the UI keeps that visible rather than pretending precision.
                  </p>
                </div>

                <RecommendationOptionBoard options={recommendation.options} />
              </div>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        eyebrow="Reading The Output"
        title="How to use Game mode honestly"
        subtitle="This is live or near-live decision support grounded in public evidence, not a black-box AI claim."
        tone="quiet"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="surface-panel rounded-[1.2rem] p-5">
            <div className="label-kicker">What it knows</div>
            <p className="mt-4 text-sm leading-8 text-muted">
              Pitcher-specific historical candidates, count/base/out context, platoon lane,
              historical usage share, and expected run value by option.
            </p>
          </div>
          <div className="surface-panel rounded-[1.2rem] p-5">
            <div className="label-kicker">What it does not know</div>
            <p className="mt-4 text-sm leading-8 text-muted">
              Private PitchCom plans, shake-offs, scouting meetings, injury restrictions, or hidden
              catcher intent. Those limits stay explicit in the UI.
            </p>
          </div>
          <div className="surface-panel rounded-[1.2rem] p-5">
            <div className="label-kicker">Best workflow</div>
            <p className="mt-4 text-sm leading-8 text-muted">
              Start with a real pairing, set the count and base/out state, and compare top options
              by expected RV, usage share, and confidence before making a baseball decision.
            </p>
          </div>
        </div>
      </SectionCard>

      <ApiDebugPanel transport={apiTransport} items={debugItems} />
    </div>
  );
}
