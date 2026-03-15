import type {
  CatcherDetailResponse,
  CatchersResponse,
  CountSummary,
  PitchTypeSummary,
} from "@catcher-intel/contracts";
import Image from "next/image";
import Link from "next/link";

import { ApiDebugPanel } from "@/components/api-debug-panel";
import { CountStateMatrix } from "@/components/count-state-matrix";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import { GradeCard } from "@/components/grade-card";
import { MetricCard } from "@/components/metric-card";
import { PairingIntelTable } from "@/components/pairing-intel-table";
import { PitchTypePerformanceBoard } from "@/components/pitch-type-performance-board";
import { ReportBuilder } from "@/components/report-builder";
import { SampleStabilityBadge } from "@/components/sample-stability-badge";
import { SectionCard } from "@/components/section-card";
import { StrikeZoneCard } from "@/components/strike-zone-card";
import { LoadingForm } from "@/components/ui/loading-form";
import { LoadingLink } from "@/components/ui/loading-link";
import {
  ApiRequestError,
  formatApiTransportLabel,
  getApiTransport,
  getApiHealth,
  getCatcherDetail,
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
  context: "api" | "catchers" | "detail",
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
      title: "No scored detail exists for this catcher selection",
      description: error.message,
      detail:
        "Choose another catcher from the live list or switch to a fully populated scored season.",
      tone: "caution" as const,
    };
  }

  return {
    eyebrow: context === "catchers" ? "Real Data Unavailable" : "API Request Failed",
    title: context === "catchers" ? "Catcher dashboard" : "Catcher detail",
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

function headlineCount(rows: CountSummary[]) {
  const filtered = rows.filter((row) => row.pitches >= 25);
  if (filtered.length === 0) {
    return rows[0];
  }
  return [...filtered].sort((left, right) => Math.abs(right.avg_dva) - Math.abs(left.avg_dva))[0];
}

function toneByIndex(index: number) {
  return ["card-tone-slate", "card-tone-sand", "card-tone-clay", "card-tone-sage"][index % 4];
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const season = readNumber(params.season);
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

  let catchers: CatchersResponse;
  let catcherStatus:
    | {
        label: string;
        status: "ok" | "error" | "warning";
        detail: string;
      }
    | undefined;
  try {
    catchers = await getCatchers({ season });
    catcherStatus = {
      label: "Catcher list",
      status: catchers.catchers.length > 0 ? "ok" : "warning",
      detail:
        catchers.catchers.length > 0
          ? `${catchers.catchers.length} catcher seasons loaded for ${catchers.season}`
          : `0 catchers returned for ${catchers.season}`,
    };
  } catch (error) {
    catcherStatus = {
      label: "Catcher list",
      status: "error",
      detail: debugErrorDetail(error),
    };
    const copy = errorStateCopy(error, "catchers", apiTransport);
    return (
      <div className="space-y-8">
        <EmptyStatePanel
          eyebrow={copy.eyebrow}
          title={copy.title}
          description={copy.description}
          detail={copy.detail}
          tone={copy.tone}
          action={
            <ApiDebugPanel
              transport={apiTransport}
              items={[healthStatus, catcherStatus]}
              defaultOpen
            />
          }
        />
      </div>
    );
  }

  const selectedCatcherId = readNumber(params.catcher_id) ?? catchers.catchers[0]?.catcher_id;

  if (!selectedCatcherId) {
    return (
      <div className="space-y-8">
        <EmptyStatePanel
          eyebrow="No Scored Data"
          title="No catcher seasons are ready to scout"
          description={`The API is reachable, but season ${catchers.season} does not have real scored catcher dashboard rows yet.`}
          detail="Rebuild catcher summaries for a populated season or switch back to the latest fully populated scored season."
          action={
            <ApiDebugPanel
              transport={apiTransport}
              items={[healthStatus, catcherStatus]}
              defaultOpen
            />
          }
        />
      </div>
    );
  }

  const leaderboardStatusPromise = getLeaderboard({
    season: catchers.season,
    minPitches: 50,
  })
    .then((response) => ({
      label: "Leaderboard",
      status: response.leaderboard.length > 0 ? "ok" as const : "warning" as const,
      detail: `${response.leaderboard.length} leaderboard rows for ${response.season}`,
    }))
    .catch((error) => ({
      label: "Leaderboard",
      status: "error" as const,
      detail: debugErrorDetail(error),
    }));

  let detail: CatcherDetailResponse;
  let detailStatus:
    | {
        label: string;
        status: "ok" | "error" | "warning";
        detail: string;
      }
    | undefined;
  try {
    detail = await getCatcherDetail(selectedCatcherId, { season: catchers.season });
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
    const leaderboardStatus = await leaderboardStatusPromise;
    return (
      <div className="space-y-8">
        <EmptyStatePanel
          eyebrow={copy.eyebrow}
          title={copy.title}
          description={copy.description}
          detail={copy.detail}
          tone={copy.tone}
          action={
            <div className="space-y-4">
              <Link
                href={`/leaderboard?season=${catchers.season}&min_pitches=50`}
                className="button-secondary inline-flex px-4 py-3 text-sm"
              >
                Open leaderboard
              </Link>
              <ApiDebugPanel
                transport={apiTransport}
                items={[healthStatus, catcherStatus, leaderboardStatus, detailStatus]}
                defaultOpen
              />
            </div>
          }
        />
      </div>
    );
  }

  const leaderboardStatus = await leaderboardStatusPromise;
  const debugItems = [healthStatus, catcherStatus, leaderboardStatus, detailStatus].filter(
    (item): item is NonNullable<typeof item> => Boolean(item),
  );

  const countBuckets = detail.count_bucket_summaries;
  const featuredCounts =
    detail.count_state_summaries.filter((row) => row.pitches >= 40).slice(0, 6).length > 0
      ? detail.count_state_summaries.filter((row) => row.pitches >= 40).slice(0, 6)
      : detail.count_state_summaries.slice(0, 6);
  const topPitchTypes = detail.pitch_type_summaries.slice(0, 6);
  const topPairings = detail.pairings.slice(0, 6);
  const topMatchups = detail.matchup_summaries.slice(0, 4);
  const gradeEntries = [
    ["overall_game_calling", "Overall Game Calling", detail.grades.overall_game_calling],
    ["count_leverage", "Count Leverage", detail.grades.count_leverage],
    ["putaway_count", "Put-Away Counts", detail.grades.putaway_count],
    ["damage_avoidance", "Damage Avoidance", detail.grades.damage_avoidance],
    ["pitch_mix_synergy", "Pitch Mix Synergy", detail.grades.pitch_mix_synergy],
    ["receiving_support", "Receiving Support", detail.grades.receiving_support],
  ] as const;
  const publicMetricCards = [
    ["Framing Runs", detail.public_metrics.framing_runs, 2],
    ["Blocking Runs", detail.public_metrics.blocking_runs, 2],
    ["Pop Time 2B", detail.public_metrics.pop_time_2b, 2],
    ["Arm Overall", detail.public_metrics.arm_overall, 1],
  ] as const;

  const bestGrade = bestBy(
    gradeEntries
      .map(([key, label, grade]) => ({ key, label, grade }))
      .filter((entry) => entry.grade.score != null),
    (entry) => entry.grade.score ?? 0,
  );
  const strongestBucket = bestBy(countBuckets, (row) => row.avg_dva);
  const mostUsedPitch = bestBy(detail.pitch_type_summaries, (row) => row.pitches);
  const bestValuePitch = strongestPitch(detail.pitch_type_summaries);
  const bestPairing = bestBy(detail.pairings, (row) => row.total_dva);
  const headlineCountState = headlineCount(detail.count_state_summaries);
  const sampleWarning = !detail.diagnostics.qualified_for_grades;

  const scoutingNotes = [
    {
      label: "Best Present Tool",
      value: bestGrade ? `${bestGrade.label} ${bestGrade.grade.score?.toFixed(1)}` : "Unscored",
      note: bestGrade ? bestGrade.grade.label ?? "Unscored" : "No stable grade yet",
    },
    {
      label: "Best Count Pocket",
      value: strongestBucket ? strongestBucket.split_value.replaceAll("_", " ") : "No signal",
      note: strongestBucket ? `${formatSigned(strongestBucket.avg_dva, 4)} avg DVA` : "No stable bucket",
    },
    {
      label: "Primary Pitch",
      value: mostUsedPitch ? mostUsedPitch.pitch_type : "No signal",
      note: mostUsedPitch
        ? `${mostUsedPitch.pitches.toLocaleString()} pitches | ${mostUsedPitch.pitch_family ?? "unknown"}`
        : "No pitch mix rows",
    },
    {
      label: "Top Battery",
      value: bestPairing ? bestPairing.pitcher_name : "No signal",
      note: bestPairing ? `${formatSigned(bestPairing.total_dva, 3)} total DVA` : "No pairing rows",
    },
  ];

  return (
    <div className="space-y-8">
      <section className="card relative overflow-hidden rounded-[1.6rem] px-5 py-5 sm:px-6 sm:py-6 lg:px-7">
        <div className="hero-wash pointer-events-none absolute inset-x-0 top-0 h-24" />
        <div className="relative grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
          <div className="space-y-6">
            <div>
              <div className="label-kicker">Catcher Scouting Dashboard</div>
              <h1 className="mt-4 max-w-3xl font-serif text-[2.55rem] leading-[0.98] text-ink sm:text-[3.2rem]">
                Real battery intelligence for catcher evaluation.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-8 text-muted sm:text-[0.98rem]">
                Evaluate catchers through observed pitch-choice quality, exact-count logic, and
                public receiving support. The dashboard stays grounded in public MLB evidence,
                without inventing private call intent.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="pill-sage rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.2em]">
                Latest scored season {catchers.season}
              </span>
              <span className="pill-sand rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.2em]">
                Public Statcast only
              </span>
              <span className="pill-clay rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.2em]">
                Model {detail.diagnostics.model_version ?? "dva_v1_contextual"}
              </span>
            </div>

            <LoadingForm
              action="/"
              className="shell-panel rounded-[1.2rem] p-3"
              loadingMessage="Loading catcher scouting view..."
              loadingSubtitle="Refreshing the dashboard with the selected catcher-season."
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_8.4rem_auto]">
                <select
                  className="field"
                  name="catcher_id"
                  defaultValue={String(detail.identity.catcher_id)}
                >
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
                  defaultValue={catchers.season}
                />
                <button className="button-primary px-5 py-3 text-sm">Load catcher</button>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <LoadingLink
                  href={`/leaderboard?season=${catchers.season}&min_pitches=50`}
                  className="button-secondary px-4 py-3 text-sm"
                  loadingMessage="Opening scouting board..."
                  loadingSubtitle="Loading the season leaderboard."
                >
                  Open leaderboard
                </LoadingLink>
                <LoadingLink
                  href={`/matchup-explorer?season=${catchers.season}&catcher_id=${detail.identity.catcher_id}`}
                  className="button-secondary px-4 py-3 text-sm"
                  loadingMessage="Opening matchup lab..."
                  loadingSubtitle="Loading the public-data recommendation workbench."
                >
                  Open matchup lab
                </LoadingLink>
                <LoadingLink href="#data-quality" className="button-secondary px-4 py-3 text-sm" disableLoading>
                  Review methodology
                </LoadingLink>
                <ReportBuilder
                  catcherId={detail.identity.catcher_id}
                  catcherName={detail.identity.catcher_name}
                  team={detail.identity.team}
                  season={catchers.season}
                />
              </div>
            </LoadingForm>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {scoutingNotes.map((note, index) => (
                <div
                  key={note.label}
                  className={[toneByIndex(index), "rounded-[1rem] p-4"].join(" ")}
                >
                  <div className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-muted">
                    {note.label}
                  </div>
                  <div className="mt-3 font-serif text-[1.45rem] leading-tight text-ink sm:text-[1.6rem]">
                    {note.value}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-muted">{note.note}</div>
                </div>
              ))}
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
                    Selected Catcher
                  </div>
                  <h2 className="mt-3 font-serif text-[2.2rem] leading-none">
                    {detail.identity.catcher_name}
                  </h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="dark-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
                      {detail.identity.team ?? "FA"}
                    </span>
                    <span className="dark-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
                      C
                    </span>
                    <span className="dark-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
                      {detail.identity.bats ?? "?"}/{detail.identity.throws ?? "?"}
                    </span>
                    <span className="dark-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em]">
                      {detail.identity.season}
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
                note="Per-pitch decision value versus weighted pitcher baseline."
                invert
              />
              <MetricCard
                label="Avg Execution Gap"
                value={formatSigned(detail.avg_execution_gap, 5)}
                note="Outcome gap relative to the modeled pitch idea."
                invert
              />
              <MetricCard
                label="Outperformed Baseline"
                value={formatPct(detail.diagnostics.outperform_rate)}
                note="Share of pitches beating the weighted alternative set."
                invert
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="scorebug rounded-[1.2rem] border border-white/10 px-4 py-3">
                <div className="text-[0.64rem] uppercase tracking-[0.2em] text-white/58">
                  Pitch Count
                </div>
                <div className="numeric mt-2 text-[1.5rem] font-semibold">
                  {detail.total_pitches.toLocaleString()}
                </div>
              </div>
              <div className="scorebug rounded-[1.2rem] border border-white/10 px-4 py-3">
                <div className="text-[0.64rem] uppercase tracking-[0.2em] text-white/58">
                  Games Scored
                </div>
                <div className="numeric mt-2 text-[1.5rem] font-semibold">
                  {(detail.diagnostics.games_scored ?? 0).toLocaleString()}
                </div>
              </div>
            </div>

            <p className="mt-5 text-sm leading-7 text-white/74">
              {detail.diagnostics.stability_note ??
                "Season-level stability guidance is not available for this catcher yet."}
            </p>
          </aside>
        </div>
      </section>

      <SectionCard
        eyebrow="Summary Stats"
        title="Season snapshot"
        subtitle="Real catcher-season workload, decision results, and stability context pulled from scored rows."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            label="Pitch Count"
            value={detail.total_pitches.toLocaleString()}
            note="Total scored pitches on this catcher-season dashboard."
          />
          <MetricCard
            label="Games Scored"
            value={String(detail.diagnostics.games_scored ?? 0)}
            note="Games contributing real pitch-level rows to the season summary."
          />
          <MetricCard
            label="Outperform Rate"
            value={formatPct(detail.diagnostics.outperform_rate)}
            note="Share of pitches that beat the weighted pitcher-specific baseline."
          />
          <MetricCard
            label="Avg Surviving Candidates"
            value={formatNumber(detail.diagnostics.avg_surviving_candidate_count, 2)}
            note="Average count of realistic alternatives available in-scoring."
          />
          <MetricCard
            label="Fallback Contexts"
            value={formatPct(detail.diagnostics.fallback_context_pct)}
            note="Share of pitches scored below the strictest exact-count context tier."
          />
          <MetricCard
            label="Dropped Sparse Contexts"
            value={formatPct(detail.diagnostics.dropped_sparse_context_pct)}
            note="Eligible pitches dropped because public context stayed too thin."
          />
        </div>
      </SectionCard>

      {sampleWarning ? (
        <section className="warning-panel rounded-[1.45rem] p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-warning">
                Data Quality
              </div>
              <div className="mt-2 font-serif text-[1.9rem] leading-none text-ink">
                Limited-sample catcher read
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
                This dashboard is using real catcher-specific scored rows, but the season has not
                yet cleared the stronger grade threshold. Treat the count board and pairing signals
                as directional scouting context rather than a settled evaluation.
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
        eyebrow="Scouting Summary"
        title="Game-calling grade sheet"
        subtitle="Six transparent scouting grades, normalized against qualified catchers in the selected scored season."
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
              <div className="label-kicker">Scouting Report</div>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted">Headline Grade</div>
                  <div className="mt-2 text-xl font-semibold text-ink">
                    {bestGrade ? bestGrade.label : "No stable grade"}
                  </div>
                  <div className="mt-2 text-sm leading-7 text-muted">
                    {bestGrade
                      ? `${bestGrade.grade.label ?? "Unscored"} on a ${bestGrade.grade.score?.toFixed(1) ?? "--"} 20-80 scale.`
                      : "This catcher-season has not produced a stable headline grade yet."}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted">Count Lens</div>
                  <div className="mt-2 text-sm leading-7 text-muted">
                    {headlineCountState
                      ? `${headlineCountState.split_value} is the standout exact-count read right now, with ${formatSigned(headlineCountState.avg_dva, 4)} avg DVA and ${headlineCountState.recommended_pitch_family ?? "no clear"} recommended family signal.`
                      : "No exact-count rows are available yet."}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted">Pitch Mix Note</div>
                  <div className="mt-2 text-sm leading-7 text-muted">
                    {bestValuePitch
                      ? `${bestValuePitch.pitch_type} currently carries the cleanest pitch-type DVA signal at ${formatSigned(bestValuePitch.avg_dva, 4)}.`
                      : "Pitch-type mix signals are not populated yet."}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted">Battery Fit</div>
                  <div className="mt-2 text-sm leading-7 text-muted">
                    {bestPairing
                      ? `${bestPairing.pitcher_name} is the top-value pairing so far at ${formatSigned(bestPairing.total_dva, 3)} total DVA.`
                      : "Pairing summaries are not available yet."}
                  </div>
                </div>
              </div>
            </div>

            <div className="card-quiet rounded-[1.6rem] p-5">
              <div className="label-kicker">Trust Context</div>
              <div className="mt-3 text-lg font-semibold text-ink">
                {detail.diagnostics.qualified_for_grades ? "Qualified sample" : "Limited confidence"}
              </div>
              <p className="mt-3 text-sm leading-7 text-muted">
                {detail.diagnostics.stability_note ??
                  "Use the diagnostics panel below to judge how much weight this catcher-season should carry."}
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Count Logic"
        title="How the count board plays"
        subtitle="Exact-count heatmap plus bucket-level tendencies for hitter leverage, pitcher leverage, and full-count traffic."
      >
        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div>
            <CountStateMatrix rows={detail.count_state_summaries} />
          </div>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {countBuckets.map((row) => (
                <div
                  key={row.split_value}
                  className="surface-panel rounded-[1.45rem] p-4"
                >
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

            <div className="surface-panel rounded-[1.6rem] p-5">
              <div className="label-kicker">Featured Exact Counts</div>
              <div className="mt-4 grid gap-3">
                {featuredCounts.map((row) => (
                  <div
                    key={row.split_value}
                    className="surface-panel-quiet grid gap-3 rounded-[1.2rem] p-4 sm:grid-cols-[5rem_1fr_auto]"
                  >
                    <div className="font-serif text-2xl text-ink">{row.split_value}</div>
                    <div className="text-sm leading-7 text-muted">
                      {row.recommended_pitch_family ?? "No signal"} recommended | actual{" "}
                      {row.actual_top_pitch_family ?? "unknown"} | {row.pitches.toLocaleString()} pitches
                    </div>
                    <div className="numeric text-right text-lg font-semibold text-ink">
                      {formatSigned(row.avg_dva, 4)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Pitch Mix"
        title="Pitch-family behavior and location context"
        subtitle="Usage and decision value by pitch type, with a future-ready strike-zone panel reserved for catcher call maps and zone heat."
      >
        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <PitchTypePerformanceBoard rows={topPitchTypes} />
          <div className="space-y-4">
            <StrikeZoneCard />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="surface-panel rounded-[1.45rem] p-4">
                <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted">
                  Most Used Pitch
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
                  Best Value Pitch
                </div>
                <div className="mt-3 text-2xl font-semibold text-ink">
                  {bestValuePitch?.pitch_type ?? "No signal"}
                </div>
                <div className="mt-2 text-sm leading-7 text-muted">
                  {bestValuePitch
                    ? `${formatSigned(bestValuePitch.avg_dva, 4)} avg DVA on ${bestValuePitch.pitches.toLocaleString()} pitches.`
                    : "No stable value leader yet."}
                </div>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Pairing Value"
        title="Battery synergies and matchup fit"
        subtitle="Pitcher-catcher pairings and handedness lanes that shape where decision value shows up."
      >
        <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <PairingIntelTable rows={topPairings} />
          <div className="grid gap-4 sm:grid-cols-2">
            {topMatchups.length > 0 ? (
              topMatchups.map((row) => (
                <div
                  key={row.matchup_label}
                  className="surface-panel rounded-[1.45rem] p-4"
                >
                  <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted">
                    {row.matchup_label}
                  </div>
                  <div className="numeric mt-3 text-[1.9rem] font-semibold text-ink">
                    {formatSigned(row.avg_dva, 4)}
                  </div>
                  <div className="mt-2 text-sm text-muted">
                    {row.pitches.toLocaleString()} pitches | {formatPct(row.outperform_rate)} outperform
                  </div>
                  <div className="mt-2 text-sm leading-6 text-muted">
                    Execution gap {formatSigned(row.avg_execution_gap, 4)}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[1.45rem] border border-dashed border-line/70 bg-surface/72 p-5 text-sm leading-7 text-muted sm:col-span-2">
                No handedness matchup summaries are available for this catcher-season yet.
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Receiving Support"
        title="Public catcher-defense context"
        subtitle="Supplemental public framing, blocking, pop time, and throwing indicators. These stay separate from DVA but help round out the scouting read."
      >
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            {publicMetricCards.map(([label, value, digits]) => (
              <MetricCard
                key={label}
                label={label}
                value={value == null ? "N/A" : Number(value).toFixed(digits)}
                note={value == null ? "Public metric unavailable for this catcher-season" : undefined}
              />
            ))}
          </div>
          <div className="surface-panel rounded-[1.6rem] p-5">
            <div className="label-kicker">Support Notes</div>
            <p className="mt-4 text-sm leading-8 text-muted">
              {detail.public_metrics.source_note ??
                "Public framing, blocking, and arm metrics are not available for this catcher-season yet. The dashboard keeps the panel visible so missing support data is explicit rather than silently replaced."}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="surface-panel-quiet rounded-[1.2rem] px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">Team</div>
                <div className="mt-2 text-lg font-semibold text-ink">{detail.identity.team ?? "FA"}</div>
              </div>
              <div className="surface-panel-quiet rounded-[1.2rem] px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">Hands</div>
                <div className="mt-2 text-lg font-semibold text-ink">
                  {detail.identity.bats ?? "?"}/{detail.identity.throws ?? "?"}
                </div>
              </div>
              <div className="surface-panel-quiet rounded-[1.2rem] px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted">Season</div>
                <div className="mt-2 text-lg font-semibold text-ink">{detail.identity.season}</div>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Data Quality"
        title="Diagnostics and scoring protocol"
        subtitle="Use these quieter indicators to judge how complete and stable the public-data scoring really is."
        tone="quiet"
        className="scroll-mt-28"
        action={
          <div id="data-quality">
            <SampleStabilityBadge
              label={detail.diagnostics.stability_label}
              qualified={detail.diagnostics.qualified_for_grades}
            />
          </div>
        }
      >
        <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              label="Avg surviving candidates"
              value={formatNumber(detail.diagnostics.avg_surviving_candidate_count, 2)}
              note="Average pitcher-specific alternatives surviving the contextual filter."
            />
            <MetricCard
              label="Single-candidate contexts"
              value={formatPct(detail.diagnostics.single_candidate_pct)}
              note="Contexts where only one realistic candidate remained."
            />
            <MetricCard
              label="Fallback-tier contexts"
              value={formatPct(detail.diagnostics.fallback_context_pct)}
              note="Pitches scored below the exact count-state + zone tier."
            />
            <MetricCard
              label="Dropped sparse contexts"
              value={formatPct(detail.diagnostics.dropped_sparse_context_pct)}
              note="Eligible pitches left unscored because the public context stayed too sparse."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(detail.grade_formula_notes).map(([gradeName, note]) => (
              <div
                key={gradeName}
                className="surface-panel rounded-[1.45rem] p-4"
              >
                <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted">
                  {gradeName.replaceAll("_", " ")}
                </div>
                <p className="mt-3 text-sm leading-7 text-muted">
                  {String(note.description ?? "No description available.")}
                </p>
                <p className="mt-2 text-[0.68rem] uppercase tracking-[0.18em] text-accent-clay">
                  {String(note.normalization ?? "Percentile normalization")}
                </p>
                <p className="mt-2 text-xs leading-6 text-muted">
                  {String(note.stability_note ?? "No stability note available.")}
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
