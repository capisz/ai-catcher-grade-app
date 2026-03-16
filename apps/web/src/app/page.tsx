import type {
  CatcherDetailResponse,
  CatchersResponse,
  CountSummary,
  LeaderboardResponse,
  LocationSummaryResponse,
  PitchTypeSummary,
} from "@catcher-intel/contracts";
import Image from "next/image";

import { ApiDebugPanel } from "@/components/api-debug-panel";
import { CatcherSummaryInsights } from "@/components/catcher-summary-insights";
import { CountStateMatrix } from "@/components/count-state-matrix";
import { DataFreshnessPanel } from "@/components/data-freshness-panel";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import { GradeCard } from "@/components/grade-card";
import { MetricCard } from "@/components/metric-card";
import { PairingDvaChart } from "@/components/pairing-dva-chart";
import { PairingIntelTable } from "@/components/pairing-intel-table";
import { PitchTypeDvaChart } from "@/components/pitch-type-dva-chart";
import { PitchTypePerformanceBoard } from "@/components/pitch-type-performance-board";
import { ProductStatusStrip } from "@/components/product-status-strip";
import { ReportBuilder } from "@/components/report-builder";
import { SampleStabilityBadge } from "@/components/sample-stability-badge";
import { SectionCard } from "@/components/section-card";
import { StrikeZoneCard } from "@/components/strike-zone-card";
import { LoadingForm } from "@/components/ui/loading-form";
import { LoadingLink } from "@/components/ui/loading-link";
import {
  ApiRequestError,
  formatApiTransportLabel,
  getApiHealth,
  getApiTransport,
  getAppMetadata,
  getCatcherDetail,
  getCatcherLocationSummary,
  getCatchers,
  getLeaderboard,
  type ApiTransportInfo,
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

function formatSigned(value: number | null | undefined, digits = 3) {
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

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null) {
    return "--";
  }
  return value.toFixed(digits);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Unavailable";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
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

function errorStateCopy(
  error: unknown,
  context: "metadata" | "catchers" | "detail",
  transport: ApiTransportInfo,
) {
  if (error instanceof ApiRequestError && (error.status == null || error.status === 503)) {
    return {
      eyebrow: "API Unreachable",
      title: "The catcher data service is offline",
      description: error.message,
      detail:
        `Targeted backend: ${transport.backendBaseUrl} (${transport.configuredFrom}). Start the FastAPI server there or update API_BASE_URL / NEXT_PUBLIC_API_URL.`,
      tone: "caution" as const,
    };
  }

  if (context === "detail" && error instanceof ApiRequestError && error.status === 404) {
    return {
      eyebrow: "Catcher Not Found",
      title: "No scored catcher detail exists for this filter set",
      description: error.message,
      detail:
        "Choose another catcher or switch to a more populated scored season. The scouting page only renders real catcher-season rows.",
      tone: "caution" as const,
    };
  }

  return {
    eyebrow: context === "metadata" ? "Metadata Unavailable" : "API Request Failed",
    title: "Scouting mode",
    description: errorMessage(error),
    detail: `API transport: ${formatApiTransportLabel(transport)} | source: ${transport.configuredFrom}`,
    tone: "default" as const,
  };
}

function bestBy<T>(rows: T[], score: (row: T) => number) {
  if (rows.length === 0) {
    return undefined;
  }
  return [...rows].sort((left, right) => score(right) - score(left))[0];
}

function strongestPitch(rows: PitchTypeSummary[]) {
  return bestBy(rows.filter((row) => row.pitches >= 25), (row) => row.avg_dva);
}

function headlineCount(rows: CountSummary[], minimumPitches: number) {
  const filtered = rows.filter((row) => row.pitches >= minimumPitches);
  if (filtered.length === 0) {
    return rows[0];
  }
  return [...filtered].sort((left, right) => Math.abs(right.avg_dva) - Math.abs(left.avg_dva))[0];
}

function buildHref(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && String(value).trim()) {
      search.set(key, String(value));
    }
  });
  return `/?${search.toString()}`;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedSeason = readNumber(params.season);
  const requestedTeam = readString(params.team, "").toUpperCase();
  const minPitches = Math.max(readNumber(params.min_pitches) ?? 60, 1);
  const selectedCountParam = readString(params.selected_count, "");
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

  const metadata = await getAppMetadata({
    season: requestedSeason,
  }).catch((error) => {
    const copy = errorStateCopy(error, "metadata", apiTransport);
    return copy;
  });

  if ("title" in metadata) {
    return (
      <EmptyStatePanel
        eyebrow={metadata.eyebrow}
        title={metadata.title}
        description={metadata.description}
        detail={metadata.detail}
        tone={metadata.tone}
        action={
          <ApiDebugPanel
            transport={apiTransport}
            items={[
              healthStatus,
              {
                label: "App metadata",
                status: "error",
                detail: metadata.description,
              },
            ]}
            defaultOpen
          />
        }
      />
    );
  }

  let catchers: CatchersResponse;
  let catcherStatus:
    | {
        label: string;
        status: "ok" | "error" | "warning";
        detail: string;
      }
    | undefined;

  try {
    catchers = await getCatchers({
      season: metadata.selected_season,
      team: requestedTeam || undefined,
    });
    catcherStatus = {
      label: "Catcher list",
      status: catchers.catchers.length > 0 ? "ok" : "warning",
      detail:
        catchers.catchers.length > 0
          ? `${catchers.catchers.length} catcher seasons loaded for ${catchers.season}`
          : `0 catchers returned for ${catchers.season}${requestedTeam ? ` (${requestedTeam})` : ""}`,
    };
  } catch (error) {
    catcherStatus = {
      label: "Catcher list",
      status: "error",
      detail: debugErrorDetail(error),
    };
    const copy = errorStateCopy(error, "catchers", apiTransport);
    return (
      <EmptyStatePanel
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        detail={copy.detail}
        tone={copy.tone}
        action={
          <ApiDebugPanel
            transport={apiTransport}
            items={[
              healthStatus,
              {
                label: "App metadata",
                status: "ok",
                detail: `${metadata.selected_season} | ${metadata.season_type_label}`,
              },
              catcherStatus,
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
        eyebrow="No Catchers Match This Filter"
        title="The scouting board has no catcher rows for this team-season slice"
        description={
          requestedTeam
            ? `No scored catchers matched team ${requestedTeam} in season ${metadata.selected_season}.`
            : `Season ${metadata.selected_season} does not have scored catcher rows yet.`
        }
        detail={metadata.season_coverage_note}
        tone="caution"
        action={
          <div className="space-y-4">
            {requestedTeam ? (
              <LoadingLink
                href={buildHref({
                  season: metadata.selected_season,
                  min_pitches: minPitches,
                })}
                className="button-secondary inline-flex px-4 py-3 text-sm"
                loadingMessage="Clearing team filter..."
                loadingSubtitle="Loading all catchers for the selected season."
              >
                Clear team filter
              </LoadingLink>
            ) : null}
            <ApiDebugPanel
              transport={apiTransport}
              items={[
                healthStatus,
                {
                  label: "App metadata",
                  status: "ok",
                  detail: `${metadata.selected_season} | ${metadata.season_type_label}`,
                },
                catcherStatus,
              ]}
              defaultOpen
            />
          </div>
        }
      />
    );
  }

  const requestedCatcherId = readNumber(params.catcher_id);
  const selectedCatcher =
    catchers.catchers.find((catcher) => catcher.catcher_id === requestedCatcherId) ??
    catchers.catchers[0];
  const selectedCatcherId = selectedCatcher?.catcher_id;

  if (!selectedCatcherId || !selectedCatcher) {
    return (
      <EmptyStatePanel
        eyebrow="No Scored Data"
        title="No catcher seasons are ready to scout"
        description={`The API is reachable, but season ${metadata.selected_season} does not have real scored catcher dashboard rows yet.`}
        detail={metadata.season_coverage_note}
        action={
          <ApiDebugPanel
            transport={apiTransport}
            items={[
              healthStatus,
              {
                label: "App metadata",
                status: "ok",
                detail: `${metadata.selected_season} | ${metadata.season_type_label}`,
              },
              catcherStatus,
            ]}
            defaultOpen
          />
        }
      />
    );
  }

  const leaderboardPromise = getLeaderboard({
    season: metadata.selected_season,
    team: requestedTeam || undefined,
    minPitches,
  }).catch((error) => error);

  const locationPromise = getCatcherLocationSummary(selectedCatcherId, {
    season: metadata.selected_season,
  }).catch((error) => error);

  let detail: CatcherDetailResponse;
  let detailStatus:
    | {
        label: string;
        status: "ok" | "error" | "warning";
        detail: string;
      }
    | undefined;

  try {
    detail = await getCatcherDetail(selectedCatcherId, { season: metadata.selected_season });
    detailStatus = {
      label: "Catcher detail",
      status: "ok",
      detail: `${detail.identity.catcher_name} | ${detail.total_pitches.toLocaleString()} pitches`,
    };
  } catch (error) {
    detailStatus = {
      label: "Catcher detail",
      status: "error",
      detail: debugErrorDetail(error),
    };
    const copy = errorStateCopy(error, "detail", apiTransport);
    return (
      <EmptyStatePanel
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        detail={copy.detail}
        tone={copy.tone}
        action={
          <ApiDebugPanel
            transport={apiTransport}
            items={[
              healthStatus,
              {
                label: "App metadata",
                status: "ok",
                detail: `${metadata.selected_season} | ${metadata.season_type_label}`,
              },
              catcherStatus,
              detailStatus,
            ]}
            defaultOpen
          />
        }
      />
    );
  }

  const leaderboardResult = await leaderboardPromise;
  const locationResult = await locationPromise;
  const leaderboard: LeaderboardResponse | null =
    leaderboardResult instanceof Error || leaderboardResult instanceof ApiRequestError
      ? null
      : leaderboardResult;
  const locationSummary: LocationSummaryResponse | null =
    locationResult instanceof Error || locationResult instanceof ApiRequestError
      ? null
      : locationResult;

  const leaderboardStatus = leaderboard
    ? {
        label: "Leaderboard",
        status: leaderboard.leaderboard.length > 0 ? ("ok" as const) : ("warning" as const),
        detail: `${leaderboard.leaderboard.length} rows for ${leaderboard.season}`,
      }
    : {
        label: "Leaderboard",
        status: "warning" as const,
        detail: leaderboardResult ? debugErrorDetail(leaderboardResult) : "Unavailable",
      };
  const locationStatus = locationSummary
    ? {
        label: "Location summary",
        status: locationSummary.available ? ("ok" as const) : ("warning" as const),
        detail: locationSummary.available
          ? `${locationSummary.cells.length} zone cells for catcher ${selectedCatcherId}`
          : locationSummary.note ?? "Unavailable",
      }
    : {
        label: "Location summary",
        status: "warning" as const,
        detail: locationResult ? debugErrorDetail(locationResult) : "Unavailable",
      };

  const debugItems = [
    healthStatus,
    {
      label: "App metadata",
      status: "ok" as const,
      detail: `${metadata.selected_season} | ${metadata.season_type_label}`,
    },
    catcherStatus,
    leaderboardStatus,
    detailStatus,
    locationStatus,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const visiblePitchTypes =
    detail.pitch_type_summaries.filter((row) => row.pitches >= minPitches).slice(0, 6).length > 0
      ? detail.pitch_type_summaries.filter((row) => row.pitches >= minPitches).slice(0, 6)
      : detail.pitch_type_summaries.slice(0, 6);
  const visiblePairings =
    detail.pairings.filter((row) => row.pitches >= minPitches).slice(0, 8).length > 0
      ? detail.pairings.filter((row) => row.pitches >= minPitches).slice(0, 8)
      : detail.pairings.slice(0, 8);
  const bestPitch = strongestPitch(detail.pitch_type_summaries);
  const mostUsedPitch = bestBy(detail.pitch_type_summaries, (row) => row.pitches);
  const bestPairing = bestBy(detail.pairings, (row) => row.total_dva);
  const selectedCount =
    detail.count_state_summaries.find((row) => row.split_value === selectedCountParam) ??
    headlineCount(detail.count_state_summaries, minPitches);
  const bucketHighlights =
    detail.count_bucket_summaries.filter((row) => row.pitches >= minPitches).length > 0
      ? detail.count_bucket_summaries.filter((row) => row.pitches >= minPitches)
      : detail.count_bucket_summaries;
  const countHrefByCount = Object.fromEntries(
    detail.count_state_summaries.map((row) => [
      row.split_value,
      buildHref({
        catcher_id: detail.identity.catcher_id,
        season: metadata.selected_season,
        team: requestedTeam || undefined,
        min_pitches: minPitches,
        selected_count: row.split_value,
      }),
    ]),
  );
  const leaderboardRows: NonNullable<typeof leaderboard>["leaderboard"] =
    leaderboard?.leaderboard ?? [];
  const leaderboardRank =
    leaderboardRows.findIndex((row) => row.catcher_id === detail.identity.catcher_id) + 1;
  const gradeEntries = [
    ["overall_game_calling", "Overall Game Calling", detail.grades.overall_game_calling],
    ["count_leverage", "Count Leverage", detail.grades.count_leverage],
    ["putaway_count", "Put-Away Counts", detail.grades.putaway_count],
    ["damage_avoidance", "Damage Avoidance", detail.grades.damage_avoidance],
    ["pitch_mix_synergy", "Pitch Mix Synergy", detail.grades.pitch_mix_synergy],
    ["receiving_support", "Receiving Support", detail.grades.receiving_support],
  ] as const;
  const bestGrade = bestBy(
    gradeEntries
      .map(([key, label, grade]) => ({ key, label, grade }))
      .filter((entry) => entry.grade.score != null),
    (entry) => entry.grade.score ?? 0,
  );
  const peers = leaderboardRows
    .filter((row) => row.catcher_id !== detail.identity.catcher_id)
    .slice(0, 5);
  const sampleWarning = metadata.sparse_season || !detail.diagnostics.qualified_for_grades;

  return (
    <div className="space-y-8">
      <section className="card relative overflow-hidden rounded-[1.6rem] px-5 py-5 sm:px-6 sm:py-6 lg:px-7">
        <div className="hero-wash pointer-events-none absolute inset-x-0 top-0 h-24" />
        <div className="relative grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
          <div className="space-y-6">
            <div>
              <div className="label-kicker">Scouting Mode</div>
              <h1 className="mt-4 max-w-3xl font-serif text-[2.55rem] leading-[0.98] text-ink sm:text-[3.15rem]">
                Season-long catcher evaluation built for real scouting decisions.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-8 text-muted sm:text-[0.98rem]">
                Use exact-count decision quality, pitch-type performance, pitcher-catcher synergy,
                and public receiving support to answer the core scouting questions: who grades
                well, why, in which counts, with which pitchers, and with how much confidence.
              </p>
            </div>

            <ProductStatusStrip
              metadata={metadata}
              sampleLabel={detail.diagnostics.stability_label}
              qualified={detail.diagnostics.qualified_for_grades}
            />

            <LoadingForm
              action="/"
              className="shell-panel rounded-[1.25rem] p-4"
              loadingMessage="Loading scouting mode..."
              loadingSubtitle="Refreshing catcher, season, team, and sample filters."
            >
              <input type="hidden" name="selected_count" value={selectedCount?.split_value ?? ""} />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-[minmax(0,1.2fr)_11rem_11rem_8.5rem_auto]">
                <label className="min-w-0 space-y-2">
                  <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    Catcher
                  </span>
                  <select
                    className="field"
                    name="catcher_id"
                    defaultValue={String(detail.identity.catcher_id)}
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
                    defaultValue={String(metadata.selected_season)}
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
                <label className="min-w-0 space-y-2">
                  <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    Min pitches
                  </span>
                  <input
                    className="field"
                    type="number"
                    min="1"
                    name="min_pitches"
                    defaultValue={minPitches}
                    data-auto-submit="true"
                  />
                </label>
                <div className="flex items-end md:col-span-2 xl:col-span-4 2xl:col-span-1">
                  <button className="button-primary w-full px-5 py-3 text-sm">
                    Refresh live board
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <LoadingLink
                  href={`/matchup-explorer?season=${metadata.selected_season}&catcher_id=${detail.identity.catcher_id}`}
                  className="button-secondary px-4 py-3 text-sm"
                  loadingMessage="Opening game mode..."
                  loadingSubtitle="Loading live matchup decision support."
                >
                  Open game mode
                </LoadingLink>
                <LoadingLink
                  href={`/research?season=${metadata.selected_season}&team=${requestedTeam || ""}&min_pitches=${minPitches}&catcher_id=${detail.identity.catcher_id}`}
                  className="button-secondary px-4 py-3 text-sm"
                  loadingMessage="Opening research mode..."
                  loadingSubtitle="Loading export and comparison tools."
                >
                  Open research mode
                </LoadingLink>
                <LoadingLink
                  href={`/compare?season=${metadata.selected_season}&team=${requestedTeam || ""}&min_pitches=${minPitches}&catcher_a=${detail.identity.catcher_id}`}
                  className="button-secondary px-4 py-3 text-sm"
                  loadingMessage="Opening compare mode..."
                  loadingSubtitle="Choosing a second catcher for side-by-side evaluation."
                >
                  Compare catcher
                </LoadingLink>
                <ReportBuilder
                  catcherId={detail.identity.catcher_id}
                  catcherName={detail.identity.catcher_name}
                  team={detail.identity.team}
                  season={metadata.selected_season}
                />
              </div>
            </LoadingForm>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="card-tone-slate rounded-[1rem] p-4">
                <div className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-muted">
                  Board rank
                </div>
                <div className="mt-3 font-serif text-[1.8rem] leading-tight text-ink">
                  {leaderboardRank > 0 ? `#${leaderboardRank}` : "Open board"}
                </div>
                <div className="mt-2 text-sm leading-6 text-muted">
                  {leaderboard
                    ? `${leaderboard.leaderboard.length} qualified rows at ${minPitches}+ pitches`
                    : "Leaderboard unavailable for this render."}
                </div>
              </div>
              <div className="card-tone-sand rounded-[1rem] p-4">
                <div className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-muted">
                  Best present tool
                </div>
                <div className="mt-3 font-serif text-[1.55rem] leading-tight text-ink">
                  {bestGrade ? bestGrade.label : "Unscored"}
                </div>
                <div className="mt-2 text-sm leading-6 text-muted">
                  {bestGrade
                    ? `${bestGrade.grade.label ?? "Unscored"} | ${bestGrade.grade.score?.toFixed(1)} grade`
                    : "No stable grade lead yet."}
                </div>
              </div>
              <div className="card-tone-clay rounded-[1rem] p-4">
                <div className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-muted">
                  Best count pocket
                </div>
                <div className="mt-3 font-serif text-[1.55rem] leading-tight text-ink">
                  {selectedCount?.split_value ?? "No signal"}
                </div>
                <div className="mt-2 text-sm leading-6 text-muted">
                  {selectedCount
                    ? `${formatSigned(selectedCount.avg_dva, 4)} avg DVA | ${selectedCount.recommended_pitch_family ?? "no family signal"}`
                    : "No exact-count split available."}
                </div>
              </div>
              <div className="card-tone-sage rounded-[1rem] p-4">
                <div className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-muted">
                  Best battery fit
                </div>
                <div className="mt-3 font-serif text-[1.55rem] leading-tight text-ink">
                  {bestPairing?.pitcher_name ?? "No signal"}
                </div>
                <div className="mt-2 text-sm leading-6 text-muted">
                  {bestPairing
                    ? `${formatSigned(bestPairing.total_dva, 3)} total DVA`
                    : "No pairing edge available yet."}
                </div>
              </div>
            </div>
          </div>

          <aside className="panel-dark overflow-hidden rounded-[1.55rem] p-5 text-white sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {detail.identity.headshot_url ? (
                  <Image
                    src={detail.identity.headshot_url}
                    alt={detail.identity.catcher_name}
                    width={104}
                    height={104}
                    className="h-24 w-24 rounded-[1.25rem] border border-white/12 object-cover"
                  />
                ) : (
                  <div className="dark-pill flex h-24 w-24 items-center justify-center rounded-[1.25rem] text-4xl font-semibold">
                    {detail.identity.catcher_name[0]}
                  </div>
                )}
                <div>
                  <div className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-white/56">
                    Selected catcher
                  </div>
                  <h2 className="mt-3 font-serif text-[2.2rem] leading-none">
                    {detail.identity.catcher_name}
                  </h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="dark-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
                      {detail.identity.team ?? "FA"}
                    </span>
                    <span className="dark-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
                      {detail.identity.bats ?? "?"}/{detail.identity.throws ?? "?"}
                    </span>
                    <span className="dark-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
                      Season {detail.identity.season}
                    </span>
                  </div>
                </div>
              </div>
              <SampleStabilityBadge
                label={detail.diagnostics.stability_label}
                qualified={detail.diagnostics.qualified_for_grades}
              />
            </div>

            <div className="scouting-seam mt-5" />

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <MetricCard
                label="Total DVA"
                value={formatSigned(detail.total_dva, 3)}
                note="Season-level sum of decision value added."
                invert
              />
              <MetricCard
                label="Avg DVA"
                value={formatSigned(detail.avg_dva, 5)}
                note="Per-pitch value versus the weighted baseline."
                invert
              />
              <MetricCard
                label="Games Scored"
                value={String(detail.diagnostics.games_scored ?? 0)}
                note="Real games contributing scored pitch rows."
                invert
              />
              <MetricCard
                label="Outperform Rate"
                value={formatPct(detail.diagnostics.outperform_rate)}
                note="Share of pitches beating the modeled alternative set."
                invert
              />
            </div>

            <p className="mt-5 text-sm leading-7 text-white/74">
              {metadata.season_coverage_note}
            </p>
            <p className="mt-3 text-sm leading-7 text-white/74">
              {detail.diagnostics.stability_note ??
                "Season-level stability guidance is not available for this catcher yet."}
            </p>
          </aside>
        </div>
      </section>

      {sampleWarning ? (
        <section className="warning-panel rounded-[1.45rem] p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-warning">
                Season Trust Note
              </div>
              <div className="mt-2 font-serif text-[1.9rem] leading-none text-ink">
                {metadata.sparse_season ? "Sparse season selected" : "Limited-sample catcher read"}
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
                {metadata.sparse_season
                  ? metadata.season_coverage_note
                  : "This catcher-season is using real scored rows, but the sample has not yet cleared the stronger stability threshold. Treat exact-count and pairing signals as directional scouting evidence rather than settled truth."}
              </p>
            </div>
            <SampleStabilityBadge
              label={detail.diagnostics.stability_label}
              qualified={detail.diagnostics.qualified_for_grades}
            />
          </div>
        </section>
      ) : null}

      <SectionCard
        eyebrow="Why This Catcher Wins"
        title="Fast scouting explanation"
        subtitle="Deterministic season-specific takeaways built from real grades, exact counts, pitch-type results, pairings, and sample diagnostics."
        action={
          <SampleStabilityBadge
            label={detail.diagnostics.stability_label}
            qualified={detail.diagnostics.qualified_for_grades}
          />
        }
      >
        <CatcherSummaryInsights insights={detail.summary_insights} />
      </SectionCard>

      <SectionCard
        eyebrow="Trust + Freshness"
        title="What period and model you are looking at"
        subtitle="This scouting surface is explicit about coverage, freshness, and scoring state so a live-looking UI never hides stale or sparse data."
      >
        <div className="space-y-5">
          <DataFreshnessPanel metadata={metadata} />
          <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="surface-panel rounded-[1.35rem] p-5">
              <div className="label-kicker">Coverage note</div>
              <p className="mt-4 text-sm leading-8 text-muted">
                {metadata.season_coverage_note}
              </p>
            </div>
            <div className="surface-panel rounded-[1.35rem] p-5">
              <div className="label-kicker">Interpretation note</div>
              <p className="mt-4 text-sm leading-8 text-muted">
                {metadata.public_data_note}
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Scouting Summary"
        title="Game-calling grade sheet"
        subtitle="Transparent 20-80 style grades for season-long scouting, anchored to qualified catchers from the selected scored season."
        action={
          <SampleStabilityBadge
            label={detail.diagnostics.stability_label}
            qualified={detail.diagnostics.qualified_for_grades}
          />
        }
      >
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {gradeEntries.map(([gradeKey, label, grade]) => (
              <GradeCard
                key={gradeKey}
                label={label}
                grade={grade}
                description={String(detail.grade_formula_notes[gradeKey]?.description ?? "")}
              />
            ))}
          </div>
          <div className="space-y-4">
            <div className="surface-panel rounded-[1.6rem] p-5">
              <div className="label-kicker">Scouting notes</div>
              <div className="mt-4 space-y-4 text-sm leading-7 text-muted">
                <p>
                  Total DVA is season-level decision value added. Avg DVA is the per-pitch version
                  of that same concept. Positive numbers mean the observed pitch choice beat the
                  public baseline.
                </p>
                <p>
                  Count leverage and put-away grades are where you should look first if you want to
                  understand whether a catcher is holding value in the highest-decision counts.
                </p>
                <p>
                  Receiving support stays separate from DVA. It gives you public framing, blocking,
                  and throwing context without pretending those metrics prove game-calling value on
                  their own.
                </p>
              </div>
            </div>
            <div className="card-quiet rounded-[1.6rem] p-5">
              <div className="label-kicker">Research handoff</div>
              <p className="mt-3 text-sm leading-7 text-muted">
                Need exports, date filters, or side-by-side comparison? Research mode keeps the
                current filters in the URL and adds broader leaderboard and report workflows.
              </p>
              <LoadingLink
                href={`/research?season=${metadata.selected_season}&team=${requestedTeam || ""}&min_pitches=${minPitches}&catcher_id=${detail.identity.catcher_id}`}
                className="button-secondary mt-4 inline-flex px-4 py-3 text-sm"
                loadingMessage="Opening research mode..."
                loadingSubtitle="Preparing comparison and export tools."
              >
                Open research mode
              </LoadingLink>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Count Logic"
        title="Exact count-state matrix"
        subtitle="Each cell uses average DVA per pitch for one exact count, with low-sample states muted and hover/tap detail built in."
      >
        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div>
            <CountStateMatrix
              key={`${detail.identity.catcher_id}-${selectedCount?.split_value ?? "default"}`}
              rows={detail.count_state_summaries}
              selectedCount={selectedCount?.split_value}
              hrefByCount={countHrefByCount}
              highlightMinimumPitches={Math.min(minPitches, 30)}
            />
          </div>
          <div id="count-detail" className="space-y-4">
            <div className="surface-panel rounded-[1.45rem] p-5">
              <div className="label-kicker">Pinned drill-down</div>
              <div className="mt-3 flex items-start justify-between gap-4">
                <div>
                  <div className="font-serif text-[2rem] leading-none text-ink">
                    {selectedCount?.split_value ?? "No count"}
                  </div>
                  <div className="mt-3 text-sm leading-7 text-muted">
                    {selectedCount
                      ? `${selectedCount.pitches.toLocaleString()} pitches scored in this exact count. Click a matrix cell to pin it in the URL and keep this drill-down in view.`
                      : "Click a count cell to pin a deeper drill-down for that exact state."}
                  </div>
                </div>
                {selectedCount ? (
                  <div className="meta-pill rounded-[1rem] px-4 py-3 text-right">
                    <div className="text-[0.62rem] uppercase tracking-[0.18em] text-muted">
                      Avg DVA
                    </div>
                    <div className="numeric mt-2 text-lg font-semibold text-ink">
                      {formatSigned(selectedCount.avg_dva, 4)}
                    </div>
                  </div>
                ) : null}
              </div>
              {selectedCount ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <MetricCard
                    label="Outperform rate"
                    value={formatPct(selectedCount.outperform_rate)}
                    note="Share of pitches in this count beating the weighted baseline."
                  />
                  <MetricCard
                    label="Execution gap"
                    value={formatSigned(selectedCount.avg_execution_gap, 4)}
                    note="Outcome gap relative to the modeled pitch idea."
                  />
                  <MetricCard
                    label="Actual top family"
                    value={selectedCount.actual_top_pitch_family ?? "--"}
                    note="Most-used pitch family in the observed public sample."
                  />
                  <MetricCard
                    label="Recommended family"
                    value={selectedCount.recommended_pitch_family ?? "--"}
                    note="Best-performing family signal in this exact count."
                  />
                  <MetricCard
                    label="Split confidence"
                    value={selectedCount.sample_label ?? "--"}
                    note="Exact-count cells under 25 pitches are visually muted as low-sample reads."
                  />
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {bucketHighlights.map((row) => (
                <div key={row.split_value} className="surface-panel rounded-[1.35rem] p-4">
                  <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted">
                    {row.split_value.replaceAll("_", " ")}
                  </div>
                  <div className="numeric mt-3 text-[1.9rem] font-semibold text-ink">
                    {formatSigned(row.avg_dva, 4)}
                  </div>
                  <div className="mt-2 text-sm text-muted">
                    {row.pitches.toLocaleString()} pitches | {formatPct(row.outperform_rate)} outperform
                  </div>
                  <div className="mt-2 text-sm leading-6 text-muted">
                    Recommended family:{" "}
                    <span className="font-semibold text-ink">
                      {row.recommended_pitch_family ?? "No signal"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Pitch Mix"
        title="Pitch-type behavior and location summary"
        subtitle="Use pitch-type rows to see what overperforms baseline, then pair that with a real strike-zone heatmap from scored location buckets."
      >
        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-5">
            <div className="surface-panel rounded-[1.45rem] p-5">
              <PitchTypeDvaChart rows={visiblePitchTypes} title="Pitch-type total DVA" />
            </div>
            <PitchTypePerformanceBoard rows={visiblePitchTypes} />
          </div>
          <div className="space-y-4">
            <StrikeZoneCard summary={locationSummary} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="surface-panel rounded-[1.45rem] p-4">
                <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted">
                  Most used pitch
                </div>
                <div className="mt-3 text-2xl font-semibold text-ink">
                  {mostUsedPitch?.pitch_type ?? "No signal"}
                </div>
                <div className="mt-2 text-sm leading-7 text-muted">
                  {mostUsedPitch
                    ? `${mostUsedPitch.pitches.toLocaleString()} pitches with ${formatSigned(mostUsedPitch.avg_dva, 4)} avg DVA.`
                    : "No pitch-type rows are available yet."}
                </div>
              </div>
              <div className="surface-panel rounded-[1.45rem] p-4">
                <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted">
                  Best value pitch
                </div>
                <div className="mt-3 text-2xl font-semibold text-ink">
                  {bestPitch?.pitch_type ?? "No signal"}
                </div>
                <div className="mt-2 text-sm leading-7 text-muted">
                  {bestPitch
                    ? `${formatSigned(bestPitch.avg_dva, 4)} avg DVA on ${bestPitch.pitches.toLocaleString()} pitches.`
                    : "No stable value leader yet."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Pairing Intelligence"
        title="Pitcher-catcher synergy and who else is good"
        subtitle="Pairings answer the battery-fit question, while the peer board tells you how this catcher stacks up against the live filtered leaderboard."
      >
        <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <div className="space-y-5">
            <div className="surface-panel rounded-[1.45rem] p-5">
              <PairingDvaChart rows={visiblePairings} title="Top pitcher pairing value" />
            </div>
            <PairingIntelTable rows={visiblePairings} />
          </div>
          <div className="space-y-4">
            <div className="surface-panel rounded-[1.45rem] p-5">
              <div className="label-kicker">Best pairing read</div>
              <p className="mt-4 text-sm leading-8 text-muted">
                {bestPairing
                  ? `${bestPairing.pitcher_name} is the best battery partner in the current season slice with ${formatSigned(bestPairing.total_dva, 3)} total DVA across ${bestPairing.pitches.toLocaleString()} paired pitches.`
                  : "No pairing rows are available yet for this catcher-season."}
              </p>
              {bestPairing ? (
                <LoadingLink
                  href={`/matchup-explorer?season=${metadata.selected_season}&catcher_id=${detail.identity.catcher_id}&pitcher_id=${bestPairing.pitcher_id}`}
                  className="button-secondary mt-4 inline-flex px-4 py-3 text-sm"
                  loadingMessage="Opening game mode..."
                  loadingSubtitle={`Loading pairing context for ${bestPairing.pitcher_name}.`}
                >
                  Explore this pairing in game mode
                </LoadingLink>
              ) : null}
            </div>

            <div className="space-y-3">
              {peers.length > 0 ? (
                peers.map((entry, index) => (
                  <LoadingLink
                    key={entry.catcher_id}
                    href={buildHref({
                      catcher_id: entry.catcher_id,
                      season: entry.season,
                      team: requestedTeam || undefined,
                      min_pitches: minPitches,
                    })}
                    loadingMessage="Loading scouting mode..."
                    loadingSubtitle={`Opening ${entry.catcher_name}.`}
                    className="surface-panel grid gap-3 rounded-[1.2rem] p-4 md:grid-cols-[3rem_1fr_auto]"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-[0.95rem] bg-surface-strong text-sm font-semibold text-white">
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-ink">{entry.catcher_name}</div>
                      <div className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">
                        {entry.team ?? "FA"} | {entry.pitches.toLocaleString()} pitches
                      </div>
                    </div>
                    <div className="numeric text-right text-lg font-semibold text-ink">
                      {formatSigned(entry.total_dva, 3)}
                    </div>
                  </LoadingLink>
                ))
              ) : (
                <div className="rounded-[1.2rem] border border-dashed border-line/70 bg-surface/72 p-5 text-sm leading-7 text-muted">
                  No peer leaderboard rows matched the current filter set.
                </div>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Data Quality"
        title="Diagnostics and support metrics"
        subtitle="This is where you judge reliability: pitch count, games scored, sparse-context rate, fallback rate, and public catcher support metrics."
        tone="quiet"
      >
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              label="Pitch count"
              value={detail.total_pitches.toLocaleString()}
              note="Total scored pitches in the current catcher-season view."
            />
            <MetricCard
              label="Games scored"
              value={String(detail.diagnostics.games_scored ?? 0)}
              note="Distinct games contributing to the scouting surface."
            />
            <MetricCard
              label="Single-candidate rate"
              value={formatPct(detail.diagnostics.single_candidate_pct)}
              note="Contexts where only one realistic option survived."
            />
            <MetricCard
              label="Fallback rate"
              value={formatPct(detail.diagnostics.fallback_context_pct)}
              note="Share of pitches scored below the strictest exact-count tier."
            />
            <MetricCard
              label="Framing runs"
              value={
                detail.public_metrics.framing_runs == null
                  ? "N/A"
                  : formatNumber(detail.public_metrics.framing_runs, 2)
              }
              note="Public framing support metric kept separate from DVA."
            />
            <MetricCard
              label="Pop time 2B"
              value={
                detail.public_metrics.pop_time_2b == null
                  ? "N/A"
                  : formatNumber(detail.public_metrics.pop_time_2b, 2)
              }
              note="Public throw-time context from Savant support data."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="surface-panel rounded-[1.45rem] p-4">
              <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted">
                Qualified status
              </div>
              <p className="mt-3 text-sm leading-7 text-muted">
                {detail.diagnostics.qualified_for_grades
                  ? "This catcher-season meets the grade qualification threshold and is safe to compare to other qualified seasons."
                  : "This catcher-season is still below the stronger grade threshold. Keep the page usable, but treat it as directional rather than settled."}
              </p>
            </div>
            <div className="surface-panel rounded-[1.45rem] p-4">
              <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted">
                Coverage window
              </div>
              <p className="mt-3 text-sm leading-7 text-muted">
                Updated through {formatDate(metadata.updated_through)}. Latest scored game date is{" "}
                {formatDate(metadata.latest_scored_game_date)}.
              </p>
            </div>
            {Object.entries(detail.grade_formula_notes).slice(0, 4).map(([gradeName, note]) => (
              <div key={gradeName} className="surface-panel rounded-[1.45rem] p-4">
                <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted">
                  {gradeName.replaceAll("_", " ")}
                </div>
                <p className="mt-3 text-sm leading-7 text-muted">
                  {String(note.description ?? "No description available.")}
                </p>
                <p className="mt-2 text-xs leading-6 text-muted">
                  {String(note.stability_note ?? "Percentile-based seasonal normalization.")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <ApiDebugPanel transport={apiTransport} items={debugItems} />
    </div>
  );
}
