import type {
  CatcherDetailResponse,
  CatchersResponse,
  PairingsResponse,
  RecommendationResponse,
} from "@catcher-intel/contracts";
import Image from "next/image";
import Link from "next/link";

import { ApiDebugPanel } from "@/components/api-debug-panel";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import { RecommendationOptionBoard } from "@/components/recommendation-option-board";
import { SampleStabilityBadge } from "@/components/sample-stability-badge";
import { SectionCard } from "@/components/section-card";
import {
  ApiRequestError,
  getApiBaseUrl,
  getApiHealth,
  getAtbatRecommendation,
  getCatcherDetail,
  getCatcherPairings,
  getCatchers,
  getUpstreamApiBaseUrl,
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

export default async function MatchupExplorerPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedSeason = readNumber(params.season);
  const stand = readString(params.stand, "R").toUpperCase();
  const pThrows = readString(params.p_throws, "R").toUpperCase();
  const balls = readNumber(params.balls) ?? 0;
  const strikes = readNumber(params.strikes) ?? 0;
  const outsWhenUp = readNumber(params.outs_when_up) ?? 0;
  const baseState = readString(params.base_state, "000");
  const batterId = readNumber(params.batter_id);
  const prevPitchType1 = readString(params.prev_pitch_type_1, "");
  const prevPitchType2 = readString(params.prev_pitch_type_2, "");
  const apiBaseUrl = await getApiBaseUrl();
  const upstreamApiBaseUrl = getUpstreamApiBaseUrl();
  const apiTransportLabel = `${apiBaseUrl} -> ${upstreamApiBaseUrl}`;

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

  let catchers: CatchersResponse;
  try {
    catchers = await getCatchers({ season: requestedSeason });
  } catch (error) {
    return (
      <div className="space-y-8">
        <EmptyStatePanel
          eyebrow="Workbench Offline"
          title="Matchup explorer cannot reach the catcher data feed"
          description={errorMessage(error)}
          detail="Start the API, confirm NEXT_PUBLIC_API_URL, and retry the recommendation workbench."
          tone="caution"
          action={
            <ApiDebugPanel
              apiBaseUrl={apiTransportLabel}
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
      </div>
    );
  }

  const catchersStatus = {
    label: "Catchers",
    status: catchers.catchers.length > 0 ? ("ok" as const) : ("warning" as const),
    detail: `${catchers.catchers.length} catcher options for ${catchers.season}`,
  };

  const selectedCatcherId = readNumber(params.catcher_id) ?? catchers.catchers[0]?.catcher_id;
  if (!selectedCatcherId) {
    return (
      <div className="space-y-8">
        <EmptyStatePanel
          eyebrow="No Scored Data"
          title="No catcher seasons are ready for recommendation work"
          description={`Season ${catchers.season} does not currently have real scored catcher options for the matchup explorer.`}
          detail="Rebuild summaries for a populated season or select a different scored season."
          action={
            <ApiDebugPanel
              apiBaseUrl={apiTransportLabel}
              items={[healthStatus, catchersStatus]}
              defaultOpen
            />
          }
        />
      </div>
    );
  }

  let catcherDetail: CatcherDetailResponse;
  try {
    catcherDetail = await getCatcherDetail(selectedCatcherId, { season: catchers.season });
  } catch (error) {
    return (
      <div className="space-y-8">
        <EmptyStatePanel
          eyebrow="Catcher Not Found"
          title="The selected catcher does not have a usable dashboard row"
          description={errorMessage(error)}
          detail="Choose a different catcher or switch to a season with real summary data."
          tone="caution"
          action={
            <ApiDebugPanel
              apiBaseUrl={apiTransportLabel}
              items={[
                healthStatus,
                catchersStatus,
                {
                  label: "Catcher detail",
                  status: "error",
                  detail: debugErrorDetail(error),
                },
              ]}
              defaultOpen
            />
          }
        />
      </div>
    );
  }

  let pairings: PairingsResponse;
  try {
    pairings = await getCatcherPairings(selectedCatcherId, {
      season: catchers.season,
      limit: 8,
    });
  } catch (error) {
    return (
      <div className="space-y-8">
        <EmptyStatePanel
          eyebrow="Pairings Unavailable"
          title="Pitcher-catcher pairings could not be loaded"
          description={errorMessage(error)}
          detail="The workbench needs real pairing rows to anchor the pitcher side of the recommendation view."
          action={
            <ApiDebugPanel
              apiBaseUrl={apiTransportLabel}
              items={[
                healthStatus,
                catchersStatus,
                {
                  label: "Pairings",
                  status: "error",
                  detail: debugErrorDetail(error),
                },
              ]}
              defaultOpen
            />
          }
        />
      </div>
    );
  }

  const selectedPitcherId = readNumber(params.pitcher_id) ?? pairings.pairings[0]?.pitcher_id;
  const selectedPitcher = pairings.pairings.find((row) => row.pitcher_id === selectedPitcherId);

  if (!selectedPitcherId) {
    return (
      <div className="space-y-8">
        <EmptyStatePanel
          eyebrow="Insufficient Real Data"
          title="No paired pitchers are available for this catcher-season"
          description="The recommendation workbench uses real pitcher-catcher context. This catcher-season does not have pairing rows yet."
          detail="Try another catcher or another populated scored season."
          action={
            <ApiDebugPanel
              apiBaseUrl={apiTransportLabel}
              items={[
                healthStatus,
                catchersStatus,
                {
                  label: "Pairings",
                  status: "warning",
                  detail: `0 pairing rows for catcher ${selectedCatcherId}`,
                },
              ]}
              defaultOpen
            />
          }
        />
      </div>
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
    catchersStatus,
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

  const selectedSeason = catchers.season;
  const safeStand = stand === "L" || stand === "S" ? stand : "R";
  const safePThrows = pThrows === "L" ? "L" : "R";
  const safeBaseState = /^[01]{3}$/.test(baseState) ? baseState : "000";

  const buildHref = (overrides: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    search.set("season", String(selectedSeason));
    search.set("catcher_id", String(selectedCatcherId));
    search.set("pitcher_id", String(overrides.pitcher_id ?? selectedPitcherId));
    search.set("stand", String(overrides.stand ?? safeStand));
    search.set("p_throws", String(overrides.p_throws ?? safePThrows));
    search.set("balls", String(overrides.balls ?? balls));
    search.set("strikes", String(overrides.strikes ?? strikes));
    search.set("outs_when_up", String(overrides.outs_when_up ?? outsWhenUp));
    search.set("base_state", String(overrides.base_state ?? safeBaseState));
    if ((overrides.batter_id ?? batterId) != null) {
      search.set("batter_id", String(overrides.batter_id ?? batterId));
    }
    if ((overrides.prev_pitch_type_1 ?? prevPitchType1) != null && String(overrides.prev_pitch_type_1 ?? prevPitchType1).trim()) {
      search.set("prev_pitch_type_1", String(overrides.prev_pitch_type_1 ?? prevPitchType1));
    }
    if ((overrides.prev_pitch_type_2 ?? prevPitchType2) != null && String(overrides.prev_pitch_type_2 ?? prevPitchType2).trim()) {
      search.set("prev_pitch_type_2", String(overrides.prev_pitch_type_2 ?? prevPitchType2));
    }
    return `/matchup-explorer?${search.toString()}`;
  };

  return (
    <div className="space-y-8">
      <section className="card relative overflow-hidden rounded-[1.6rem] px-5 py-5 sm:px-6 sm:py-6 lg:px-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_right,rgba(196,163,106,0.14),transparent_42%),radial-gradient(circle_at_top_left,rgba(184,95,59,0.08),transparent_34%)]" />
        <div className="relative grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <div className="space-y-6">
            <div>
              <div className="label-kicker">Matchup Explorer</div>
              <h1 className="mt-4 max-w-3xl font-serif text-[2.45rem] leading-[0.98] text-ink sm:text-[3.05rem]">
                Build a public-data pitch recommendation from real battery context.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-8 text-muted">
                This workbench uses the current contextual model, pitcher-specific alternatives,
                and historical usage. It is decision support from observed MLB data, not a claim
                about private PitchCom intent.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-line/70 bg-white/76 px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted">
                Scored season {selectedSeason}
              </span>
              <span className="rounded-full border border-line/70 bg-white/76 px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted">
                Model {catcherDetail.diagnostics.model_version ?? "dva_v1_contextual"}
              </span>
              <span className="rounded-full border border-line/70 bg-white/76 px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted">
                Pitcher-specific candidates
              </span>
            </div>

            <form action="/matchup-explorer" className="shell-panel rounded-[1.2rem] p-3">
              <div className="grid gap-3 xl:grid-cols-2">
                <select className="field" name="catcher_id" defaultValue={String(selectedCatcherId)}>
                  {catchers.catchers.map((catcher) => (
                    <option key={catcher.catcher_id} value={catcher.catcher_id}>
                      {catcher.dropdown_label}
                    </option>
                  ))}
                </select>
                <input
                  className="field"
                  type="number"
                  min="2008"
                  max="2100"
                  name="season"
                  defaultValue={selectedSeason}
                />
                <input
                  className="field"
                  type="number"
                  min="1"
                  name="pitcher_id"
                  defaultValue={selectedPitcherId}
                  placeholder="Pitcher MLBAM ID"
                />
                <input
                  className="field"
                  type="number"
                  min="1"
                  name="batter_id"
                  defaultValue={batterId}
                  placeholder="Batter MLBAM ID (optional)"
                />
                <select className="field" name="stand" defaultValue={safeStand}>
                  <option value="R">Batter bats R</option>
                  <option value="L">Batter bats L</option>
                  <option value="S">Batter switch</option>
                </select>
                <select className="field" name="p_throws" defaultValue={safePThrows}>
                  <option value="R">Pitcher throws R</option>
                  <option value="L">Pitcher throws L</option>
                </select>
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
                <button className="button-primary px-5 py-3 text-sm">Run recommendation</button>
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

              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href={`/?catcher_id=${selectedCatcherId}&season=${selectedSeason}`}
                  className="button-secondary px-4 py-3 text-sm"
                >
                  Open catcher dashboard
                </Link>
                <Link
                  href={`/leaderboard?season=${selectedSeason}&min_pitches=50`}
                  className="button-secondary px-4 py-3 text-sm"
                >
                  Open leaderboard
                </Link>
              </div>
            </form>
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
                  <div className="flex h-24 w-24 items-center justify-center rounded-[1.15rem] border border-white/12 bg-white/8 text-3xl font-semibold">
                    {catcherDetail.identity.catcher_name[0]}
                  </div>
                )}
                <div>
                  <div className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-white/56">
                    Active battery context
                  </div>
                  <h2 className="mt-3 font-serif text-[2rem] leading-none">
                    {catcherDetail.identity.catcher_name}
                  </h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
                      {catcherDetail.identity.team ?? "FA"}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
                      Pitcher {selectedPitcherId}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
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
                  Selected pitcher
                </div>
                <div className="mt-2 text-lg font-semibold">
                  {selectedPitcher?.pitcher_name ?? `Pitcher ${selectedPitcherId}`}
                </div>
                <div className="mt-2 text-sm text-white/72">
                  {selectedPitcher ? `${selectedPitcher.pitches.toLocaleString()} historical paired pitches` : "Manual pitcher selection"}
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
                  Candidate baseline for this context
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
                "Recommendation data is unavailable for this exact context. The workbench keeps the context visible so missing model support is explicit."}
            </p>
          </aside>
        </div>
      </section>

      <SectionCard
        eyebrow="Pairing Shortlist"
        title="Quick-select pitcher partners"
        subtitle="Use real pitcher-catcher pairings to anchor the recommendation context before adjusting count, base state, and hitter handedness."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {pairings.pairings.map((row) => {
            const active = row.pitcher_id === selectedPitcherId;
            return (
              <Link
                key={row.pitcher_id}
                href={buildHref({ pitcher_id: row.pitcher_id })}
                className={[
                  "rounded-[1.1rem] border p-4 transition",
                  active
                    ? "border-surface-strong bg-surface-strong text-white shadow-[0_14px_24px_rgba(8,33,29,0.16)]"
                    : "border-line/60 bg-white/78 hover:-translate-y-0.5 hover:border-accent/24",
                ].join(" ")}
              >
                <div className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] opacity-70">
                  Pitcher {row.pitcher_id}
                </div>
                <div className="mt-3 text-lg font-semibold">
                  {row.pitcher_name}
                </div>
                <div className="mt-2 text-sm leading-6 opacity-80">
                  {row.pitches.toLocaleString()} paired pitches
                </div>
                <div className="numeric mt-3 text-xl font-semibold">
                  {formatSigned(row.total_dva, 3)}
                </div>
              </Link>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Recommendation Board"
        title="Recommended pitch options"
        subtitle="Observed public-data options ranked by expected run value in the selected context."
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
            detail="Adjust the pitcher, count, or base/out state. The workbench only shows real candidates that survive the current public-data context filters."
            tone="caution"
          />
        ) : recommendation ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-[1rem] border border-line/60 bg-white/78 px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">Count</div>
                <div className="mt-2 text-lg font-semibold text-ink">{recommendation.count_state}</div>
              </div>
              <div className="rounded-[1rem] border border-line/60 bg-white/78 px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">Count bucket</div>
                <div className="mt-2 text-lg font-semibold text-ink">
                  {recommendation.count_bucket.replaceAll("_", " ")}
                </div>
              </div>
              <div className="rounded-[1rem] border border-line/60 bg-white/78 px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">Base state</div>
                <div className="mt-2 text-lg font-semibold text-ink">{recommendation.base_state}</div>
              </div>
              <div className="rounded-[1rem] border border-line/60 bg-white/78 px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">Outs</div>
                <div className="mt-2 text-lg font-semibold text-ink">{recommendation.outs_state}</div>
              </div>
              <div className="rounded-[1rem] border border-line/60 bg-white/78 px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">Platoon</div>
                <div className="mt-2 text-lg font-semibold text-ink">
                  {recommendation.platoon_flag.replaceAll("_", " ")}
                </div>
              </div>
            </div>
            <RecommendationOptionBoard options={recommendation.options} />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        eyebrow="Methodology"
        title="How to read this recommendation"
        subtitle="Decision support grounded in public-data alternatives, not hidden call intent."
        tone="quiet"
      >
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.2rem] border border-line/60 bg-white/76 p-5">
            <div className="label-kicker">Public-data honesty</div>
            <p className="mt-4 text-sm leading-8 text-muted">
              The recommendation engine compares actual MLB pitch choices to realistic
              pitcher-specific alternatives in similar public contexts. It does not claim private
              PitchCom knowledge, shake-off information, or internal scouting plan access.
            </p>
          </div>
          <div className="rounded-[1.2rem] border border-line/60 bg-white/76 p-5">
            <div className="label-kicker">Using the workbench</div>
            <p className="mt-4 text-sm leading-8 text-muted">
              Start from a real catcher-pitcher pairing, set the count and base/out situation, and
              compare the returned pitch options by expected run value and historical usage share.
              If no candidates survive, the UI will say so explicitly.
            </p>
          </div>
        </div>
      </SectionCard>

      <ApiDebugPanel apiBaseUrl={apiTransportLabel} items={debugItems} />
    </div>
  );
}
