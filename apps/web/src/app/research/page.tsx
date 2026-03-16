import type { CatcherDetailResponse, LeaderboardResponse } from "@catcher-intel/contracts";

import { ApiDebugPanel } from "@/components/api-debug-panel";
import { DataFreshnessPanel } from "@/components/data-freshness-panel";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import { LeaderboardChart } from "@/components/leaderboard-chart";
import { MetricCard } from "@/components/metric-card";
import { PitchTypeDvaChart } from "@/components/pitch-type-dva-chart";
import { ProductStatusStrip } from "@/components/product-status-strip";
import { ReportBuilder } from "@/components/report-builder";
import { SampleStabilityBadge } from "@/components/sample-stability-badge";
import { SectionCard } from "@/components/section-card";
import { LoadingForm } from "@/components/ui/loading-form";
import { LoadingLink } from "@/components/ui/loading-link";
import {
  ApiRequestError,
  getApiHealth,
  getApiTransport,
  getAppMetadata,
  getCatcherDetail,
  getCatchers,
  getLeaderboard,
} from "@/lib/api";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readString(value: string | string[] | undefined, fallback = "") {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }
  return value ?? fallback;
}

function readNumber(value: string | string[] | undefined, fallback?: number) {
  const text = readString(value, "");
  if (!text.trim()) {
    return fallback;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function summaryCard(detail: CatcherDetailResponse) {
  return [
    {
      label: "Total DVA",
      value: formatSigned(detail.total_dva, 3),
      note: "Season-level decision value added",
    },
    {
      label: "Avg DVA",
      value: formatSigned(detail.avg_dva, 5),
      note: "Per-pitch decision value",
    },
    {
      label: "Pitch Count",
      value: detail.total_pitches.toLocaleString(),
      note: "Real scored pitches on the season card",
    },
    {
      label: "Outperform Rate",
      value: formatPct(detail.diagnostics.outperform_rate),
      note: "Share of pitches beating the baseline",
    },
  ];
}

export default async function ResearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedSeason = readNumber(params.season);
  const minPitches = Math.max(readNumber(params.min_pitches, 50) ?? 50, 1);
  const sort = readString(params.sort, "total_dva");
  const dateFrom = readString(params.date_from, "");
  const dateTo = readString(params.date_to, "");
  const requestedTeam = readString(params.team, "").toUpperCase();
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
        eyebrow="Research Offline"
        title="Research mode cannot load app metadata"
        description={errorMessage(error)}
        detail={`Targeted backend: ${apiTransport.backendBaseUrl} (${apiTransport.configuredFrom}). Start the API there or update API_BASE_URL / NEXT_PUBLIC_API_URL before retrying.`}
        tone="caution"
      />
    );
  }

  let leaderboard: LeaderboardResponse;
  try {
    leaderboard = await getLeaderboard({
      minPitches,
      season: metadata.selected_season,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      team: requestedTeam || undefined,
    });
  } catch (error) {
    return (
      <EmptyStatePanel
        eyebrow="Research Offline"
        title="The filtered leaderboard could not be loaded"
        description={errorMessage(error)}
        detail={`Targeted backend: ${apiTransport.backendBaseUrl} (${apiTransport.configuredFrom}). Restart the API there or update API_BASE_URL before retrying.`}
        tone="caution"
        action={
          <ApiDebugPanel
            transport={apiTransport}
            items={[
              healthStatus,
              {
                label: "Leaderboard",
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

  const orderedLeaderboard = [...leaderboard.leaderboard].sort((left, right) => {
    if (sort === "avg_dva") {
      return right.avg_dva - left.avg_dva;
    }
    return right.total_dva - left.total_dva;
  });

  const catchers = await getCatchers({
    season: metadata.selected_season,
    team: requestedTeam || undefined,
  }).catch(() => null);
  const primaryRequested = readNumber(params.catcher_id);
  const compareRequested = readNumber(params.compare_catcher_id);

  const primaryCatcherId =
    (catchers?.catchers.find((row) => row.catcher_id === primaryRequested)?.catcher_id ??
      orderedLeaderboard[0]?.catcher_id ??
      catchers?.catchers[0]?.catcher_id) || undefined;

  const compareCatcherId =
    compareRequested && compareRequested !== primaryCatcherId ? compareRequested : undefined;

  const primaryDetail = primaryCatcherId
    ? await getCatcherDetail(primaryCatcherId, { season: metadata.selected_season }).catch(() => null)
    : null;
  const compareDetail = compareCatcherId
    ? await getCatcherDetail(compareCatcherId, { season: metadata.selected_season }).catch(() => null)
    : null;

  const debugItems = [
    healthStatus,
    {
      label: "App metadata",
      status: "ok" as const,
      detail: `${metadata.selected_season} | ${metadata.season_type_label}`,
    },
    {
      label: "Leaderboard",
      status: orderedLeaderboard.length > 0 ? ("ok" as const) : ("warning" as const),
      detail: `${orderedLeaderboard.length} leaderboard rows for ${leaderboard.season}`,
    },
    {
      label: "Primary detail",
      status: primaryDetail ? ("ok" as const) : ("warning" as const),
      detail: primaryDetail
        ? `${primaryDetail.identity.catcher_name} | ${primaryDetail.total_pitches.toLocaleString()} pitches`
        : "No primary catcher detail available",
    },
    {
      label: "Compare detail",
      status: compareDetail ? ("ok" as const) : ("warning" as const),
      detail: compareDetail
        ? `${compareDetail.identity.catcher_name} | ${compareDetail.total_pitches.toLocaleString()} pitches`
        : "No compare catcher selected",
    },
  ];

  const boardExportUrl = buildHref("/api/backend/catchers/leaderboard", {
    season: metadata.selected_season,
    min_pitches: minPitches,
    team: requestedTeam || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  });
  const countsExportUrl = primaryDetail
    ? buildHref(`/api/backend/catchers/${primaryDetail.identity.catcher_id}/counts`, {
        season: metadata.selected_season,
      })
    : "";
  const pitchTypeExportUrl = primaryDetail
    ? buildHref(`/api/backend/catchers/${primaryDetail.identity.catcher_id}/pitch-types`, {
        season: metadata.selected_season,
      })
    : "";
  const pairingExportUrl = primaryDetail
    ? buildHref(`/api/backend/catchers/${primaryDetail.identity.catcher_id}/pairings`, {
        season: metadata.selected_season,
        limit: 100,
      })
    : "";

  return (
    <div className="space-y-8">
      <section className="card relative overflow-hidden rounded-[1.6rem] px-5 py-5 sm:px-6 sm:py-6 lg:px-7">
        <div className="hero-wash pointer-events-none absolute inset-x-0 top-0 h-24" />
        <div className="relative grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
          <div className="space-y-6">
            <div>
              <div className="label-kicker">Research Mode</div>
              <h1 className="mt-4 max-w-4xl font-serif text-[2.5rem] leading-[0.98] text-ink sm:text-[3.1rem]">
                Advanced filtering, comparison, and export for deeper catcher analysis.
              </h1>
              <p className="mt-5 max-w-3xl text-sm leading-8 text-muted">
                Research mode is where you slice the board, compare catchers side by side, export
                live JSON or full reports, and keep your filter state in the URL so the page is
                naturally shareable.
              </p>
            </div>

            {primaryDetail ? (
              <ProductStatusStrip
                metadata={metadata}
                sampleLabel={primaryDetail.diagnostics.stability_label}
                qualified={primaryDetail.diagnostics.qualified_for_grades}
              />
            ) : (
              <ProductStatusStrip metadata={metadata} />
            )}

            <LoadingForm
              action="/research"
              className="shell-panel rounded-[1.2rem] p-4"
              loadingMessage="Refreshing research mode..."
              loadingSubtitle="Applying filtered leaderboard and comparison settings."
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
                <input
                  className="field"
                  type="number"
                  min="1"
                  name="min_pitches"
                  defaultValue={minPitches}
                  data-auto-submit="true"
                />
                <input
                  className="field"
                  type="date"
                  name="date_from"
                  defaultValue={dateFrom}
                  data-auto-submit="true"
                />
                <input
                  className="field"
                  type="date"
                  name="date_to"
                  defaultValue={dateTo}
                  data-auto-submit="true"
                />
                <select className="field" name="sort" defaultValue={sort} data-auto-submit="true">
                  <option value="total_dva">Sort by total DVA</option>
                  <option value="avg_dva">Sort by avg DVA</option>
                </select>
                <button className="button-primary px-5 py-3 text-sm md:col-span-2 xl:col-span-3">
                  Refresh board
                </button>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <select
                  className="field"
                  name="catcher_id"
                  defaultValue={primaryDetail ? String(primaryDetail.identity.catcher_id) : ""}
                  data-auto-submit="true"
                >
                  <option value="">Primary catcher</option>
                  {(catchers?.catchers ?? []).map((catcher) => (
                    <option key={catcher.catcher_id} value={catcher.catcher_id}>
                      {catcher.dropdown_label}
                    </option>
                  ))}
                </select>
                <select
                  className="field"
                  name="compare_catcher_id"
                  defaultValue={compareDetail ? String(compareDetail.identity.catcher_id) : ""}
                  data-auto-submit="true"
                >
                  <option value="">Compare catcher (optional)</option>
                  {(catchers?.catchers ?? []).map((catcher) => (
                    <option key={catcher.catcher_id} value={catcher.catcher_id}>
                      {catcher.dropdown_label}
                    </option>
                  ))}
                </select>
              </div>
            </LoadingForm>
          </div>

          <aside className="panel-dark overflow-hidden rounded-[1.55rem] p-5 text-white sm:p-6">
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-white/56">
              Research board
            </div>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <div className="font-serif text-[2.8rem] leading-none">{metadata.selected_season}</div>
                <div className="mt-3 text-sm text-white/72">
                  {orderedLeaderboard.length} qualifying catchers on the current filter set
                </div>
              </div>
              <div className="scorebug rounded-[1.25rem] px-4 py-3">
                <div className="text-[0.64rem] uppercase tracking-[0.18em] text-white/56">
                  Filter floor
                </div>
                <div className="numeric mt-2 text-2xl font-semibold">{minPitches}</div>
              </div>
            </div>

            <div className="scouting-seam mt-6" />

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="scorebug rounded-[1.2rem] border border-white/10 px-4 py-3">
                <div className="text-[0.64rem] uppercase tracking-[0.18em] text-white/56">
                  Shareable state
                </div>
                <div className="mt-2 text-lg font-semibold">URL-backed</div>
                <div className="mt-2 text-sm text-white/72">
                  Current filters, compare target, and date window live in the page URL
                </div>
              </div>
              <div className="scorebug rounded-[1.2rem] border border-white/10 px-4 py-3">
                <div className="text-[0.64rem] uppercase tracking-[0.18em] text-white/56">
                  Date filter status
                </div>
                <div className="mt-2 text-lg font-semibold">
                  {dateFrom || dateTo ? "Active" : "Full season"}
                </div>
                <div className="mt-2 text-sm text-white/72">
                  Leaderboard honors the date window. Catcher detail cards remain season-level.
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <SectionCard
        eyebrow="Freshness"
        title="Current data window"
        subtitle="Research mode still keeps the underlying ingest and scoring freshness visible so exports are easy to trust."
      >
        <DataFreshnessPanel metadata={metadata} />
      </SectionCard>

      {primaryDetail ? (
        <SectionCard
          eyebrow="Comparison"
          title="Side-by-side catcher view"
          subtitle="Use this for quick comparison. Note that these summary cards are season-level, even when the leaderboard table is date-filtered."
        >
          <div className="grid gap-6 xl:grid-cols-2">
            {[primaryDetail, compareDetail].filter(Boolean).map((detail) => (
              <div key={detail!.identity.catcher_id} className="card-quiet rounded-[1.5rem] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="label-kicker">{detail!.identity.team ?? "FA"}</div>
                    <h3 className="mt-3 font-serif text-[2rem] leading-none text-ink">
                      {detail!.identity.catcher_name}
                    </h3>
                  </div>
                  <SampleStabilityBadge
                    label={detail!.diagnostics.stability_label}
                    qualified={detail!.diagnostics.qualified_for_grades}
                    compact
                  />
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {summaryCard(detail!).map((card) => (
                    <MetricCard
                      key={`${detail!.identity.catcher_id}-${card.label}`}
                      label={card.label}
                      value={card.value}
                      note={card.note}
                    />
                  ))}
                </div>
                <div className="mt-5 surface-panel rounded-[1.35rem] p-4">
                  <PitchTypeDvaChart
                    rows={detail!.pitch_type_summaries.slice(0, 6)}
                    title={`${detail!.identity.catcher_name} pitch-type DVA`}
                    heightClass="h-[16rem]"
                  />
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <LoadingLink
                    href={`/?catcher_id=${detail!.identity.catcher_id}&season=${metadata.selected_season}&team=${requestedTeam || ""}`}
                    className="button-secondary px-4 py-3 text-sm"
                    loadingMessage="Opening scouting mode..."
                    loadingSubtitle={`Loading ${detail!.identity.catcher_name}.`}
                  >
                    Open scouting mode
                  </LoadingLink>
                  <ReportBuilder
                    catcherId={detail!.identity.catcher_id}
                    catcherName={detail!.identity.catcher_name}
                    team={detail!.identity.team}
                    season={metadata.selected_season}
                  />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        eyebrow="Exports"
        title="JSON endpoints and report downloads"
        subtitle="Research mode surfaces direct JSON paths for the live filtered board and catcher breakdown endpoints, plus report downloads for richer exports."
      >
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <a href={boardExportUrl} className="surface-panel rounded-[1.2rem] p-5 transition hover:-translate-y-0.5 hover:border-accent/24">
            <div className="label-kicker">Leaderboard JSON</div>
            <p className="mt-4 text-sm leading-7 text-muted">
              Export the current filtered leaderboard payload directly from the proxy-backed API.
            </p>
          </a>
          <a href={countsExportUrl || "#"} className="surface-panel rounded-[1.2rem] p-5 transition hover:-translate-y-0.5 hover:border-accent/24">
            <div className="label-kicker">Count breakdown JSON</div>
            <p className="mt-4 text-sm leading-7 text-muted">
              Export the selected catcher&apos;s exact-count and bucket breakdowns.
            </p>
          </a>
          <a href={pitchTypeExportUrl || "#"} className="surface-panel rounded-[1.2rem] p-5 transition hover:-translate-y-0.5 hover:border-accent/24">
            <div className="label-kicker">Pitch-type JSON</div>
            <p className="mt-4 text-sm leading-7 text-muted">
              Export pitch-type usage and DVA rows for the selected catcher-season.
            </p>
          </a>
          <a href={pairingExportUrl || "#"} className="surface-panel rounded-[1.2rem] p-5 transition hover:-translate-y-0.5 hover:border-accent/24">
            <div className="label-kicker">Pairings JSON</div>
            <p className="mt-4 text-sm leading-7 text-muted">
              Export pairing intelligence for the selected catcher-season.
            </p>
          </a>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Board Snapshot"
        title="Top of the filtered board"
        subtitle="Fast horizontal view of who is grading best under the current filters before you drill into the full ranking table."
        action={
          orderedLeaderboard.length >= 2 ? (
            <LoadingLink
              href={buildHref("/compare", {
                season: metadata.selected_season,
                team: requestedTeam || undefined,
                min_pitches: minPitches,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
                catcher_a: orderedLeaderboard[0]?.catcher_id,
                catcher_b: orderedLeaderboard[1]?.catcher_id,
              })}
              className="button-secondary inline-flex px-4 py-3 text-sm"
              loadingMessage="Opening compare mode..."
              loadingSubtitle="Comparing the top two catchers from the filtered leaderboard."
            >
              Compare top two
            </LoadingLink>
          ) : null
        }
      >
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <LeaderboardChart entries={orderedLeaderboard.slice(0, 8)} />
          <div className="grid gap-4 sm:grid-cols-2">
            {orderedLeaderboard.slice(0, 4).map((entry, index) => (
              <LoadingLink
                key={entry.catcher_id}
                href={`/?catcher_id=${entry.catcher_id}&season=${entry.season}&team=${requestedTeam || ""}`}
                loadingMessage="Loading scouting mode..."
                loadingSubtitle={`Opening ${entry.catcher_name}.`}
                className={[
                  ["card-tone-slate", "card-tone-sand", "card-tone-clay", "card-tone-sage"][index % 4],
                  "rounded-[1.25rem] p-4 transition hover:-translate-y-0.5 hover:border-accent/24",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[0.95rem] bg-surface-strong text-sm font-semibold text-white">
                    {index + 1}
                  </div>
                  <SampleStabilityBadge
                    label={entry.stability_label}
                    qualified={entry.qualified_for_grades}
                    compact
                  />
                </div>
                <div className="mt-4 font-semibold text-ink">{entry.catcher_name}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                  {entry.team ?? "FA"} | {entry.games_scored} games | {entry.pitches.toLocaleString()} pitches
                </div>
                <div className="numeric mt-4 text-2xl font-semibold text-ink">
                  {formatSigned(entry.total_dva, 3)}
                </div>
                <div className="mt-2 text-sm leading-6 text-muted">
                  Avg DVA {formatSigned(entry.avg_dva, 5)} | {entry.grades.overall_game_calling.label ?? "Unscored"}
                </div>
              </LoadingLink>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Leaderboard Table"
        title="Full filtered catcher ranking board"
        subtitle="Use this as the main research table. It respects team, pitch floor, and date range filters."
        tone="quiet"
      >
        {orderedLeaderboard.length === 0 ? (
          <div className="rounded-[1.6rem] border border-dashed border-line/70 bg-surface/72 p-6 text-sm leading-7 text-muted">
            No real scored catchers matched the current filters for season {leaderboard.season}.
            Lower the minimum pitch threshold, widen the date range, or switch to a populated
            scored season.
          </div>
        ) : (
          <div className="space-y-3">
            {orderedLeaderboard.map((entry, index) => (
              <LoadingLink
                key={entry.catcher_id}
                href={buildHref("/research", {
                  season: entry.season,
                  team: requestedTeam || undefined,
                  min_pitches: minPitches,
                  date_from: dateFrom || undefined,
                  date_to: dateTo || undefined,
                  sort,
                  catcher_id: entry.catcher_id,
                  compare_catcher_id: compareDetail?.identity.catcher_id,
                })}
                loadingMessage="Refreshing research comparison..."
                loadingSubtitle={`Focusing research mode on ${entry.catcher_name}.`}
                className="surface-panel grid gap-4 rounded-[1.3rem] p-4 transition hover:-translate-y-0.5 hover:border-accent/24 md:grid-cols-[4rem_1.6fr_.95fr_.9fr_.9fr_1.1fr]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-[0.95rem] bg-surface-strong text-sm font-semibold text-white">
                  {index + 1}
                </div>
                <div>
                  <div className="font-semibold text-ink">{entry.catcher_name}</div>
                  <div className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">
                    {entry.team ?? "FA"} | {entry.games_scored} games | {entry.pitches.toLocaleString()} pitches
                  </div>
                </div>
                <div>
                  <div className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted">
                    Total DVA
                  </div>
                  <div className="numeric mt-2 text-xl font-semibold text-ink">
                    {formatSigned(entry.total_dva, 3)}
                  </div>
                </div>
                <div>
                  <div className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted">
                    Avg DVA
                  </div>
                  <div className="numeric mt-2 text-xl font-semibold text-ink">
                    {formatSigned(entry.avg_dva, 5)}
                  </div>
                </div>
                <div>
                  <div className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted">
                    Stability
                  </div>
                  <div className="mt-2">
                    <SampleStabilityBadge
                      label={entry.stability_label}
                      qualified={entry.qualified_for_grades}
                      compact
                    />
                  </div>
                </div>
                <div>
                  <div className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted">
                    Support read
                  </div>
                  <div className="mt-2 text-sm leading-6 text-muted">
                    Framing {entry.public_metrics.framing_runs == null ? "N/A" : entry.public_metrics.framing_runs.toFixed(2)}
                  </div>
                  <div className="text-sm leading-6 text-muted">
                    Outperform {formatPct(entry.outperform_rate)}
                  </div>
                </div>
              </LoadingLink>
            ))}
          </div>
        )}
      </SectionCard>

      <ApiDebugPanel transport={apiTransport} items={debugItems} />
    </div>
  );
}
