import type { LeaderboardResponse } from "@catcher-intel/contracts";
import Link from "next/link";

import { ApiDebugPanel } from "@/components/api-debug-panel";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import { LeaderboardChart } from "@/components/leaderboard-chart";
import { SampleStabilityBadge } from "@/components/sample-stability-badge";
import { SectionCard } from "@/components/section-card";
import {
  ApiRequestError,
  getApiBaseUrl,
  getApiHealth,
  getLeaderboard,
  getUpstreamApiBaseUrl,
} from "@/lib/api";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function readString(value: string | string[] | undefined, fallback: string) {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }
  return value ?? fallback;
}

function readNumber(value: string | string[] | undefined, fallback: number) {
  const parsed = Number(readString(value, String(fallback)));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatSigned(value: number | null | undefined, digits = 3) {
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

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const minPitches = readNumber(params.min_pitches, 50);
  const sort = readString(params.sort, "total_dva");
  const season = readNumber(params.season, NaN);
  const dateFrom = readString(params.date_from, "");
  const dateTo = readString(params.date_to, "");
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
      detail: errorMessage(error),
    }));

  let response: LeaderboardResponse;
  try {
    response = await getLeaderboard({
      minPitches,
      season: Number.isFinite(season) ? season : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    });
  } catch (error) {
    return (
      <div className="space-y-8">
        <EmptyStatePanel
          eyebrow="Real Data Unavailable"
          title="Catcher leaderboard"
          description={errorMessage(error)}
          detail="The leaderboard only renders real scored seasons. Restart the API or rebuild summaries before retrying."
          action={
            <ApiDebugPanel
              apiBaseUrl={apiTransportLabel}
              items={[
                healthStatus,
                {
                  label: "Leaderboard",
                  status: "error",
                  detail: errorMessage(error),
                },
              ]}
              defaultOpen
            />
          }
        />
      </div>
    );
  }

  const leaderboard = [...response.leaderboard].sort((left, right) => {
    if (sort === "avg_dva") {
      return right.avg_dva - left.avg_dva;
    }
    return right.total_dva - left.total_dva;
  });

  const leader = leaderboard[0];
  const leaderboardStatus = {
    label: "Leaderboard",
    status: leaderboard.length > 0 ? ("ok" as const) : ("warning" as const),
    detail: `${leaderboard.length} qualifying catcher rows for ${response.season}`,
  };

  return (
    <div className="space-y-8">
      <section className="card relative overflow-hidden rounded-[1.6rem] px-5 py-5 sm:px-6 sm:py-6 lg:px-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top_right,rgba(196,163,106,0.14),transparent_42%),radial-gradient(circle_at_top_left,rgba(184,95,59,0.08),transparent_34%)]" />
        <div className="relative grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
          <div>
            <div className="label-kicker">Scouting Board</div>
            <h1 className="mt-4 max-w-4xl font-serif text-[2.5rem] leading-[0.98] text-ink sm:text-[3.1rem]">
              Catcher leaderboard for fast board reads and deeper scouting pivots.
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-8 text-muted">
              Scan season-level catcher value, identify who is qualifying on real pitch volume, and
              move directly into the full scouting dashboard for a deeper read.
            </p>

            <form action="/leaderboard" className="shell-panel mt-6 rounded-[1.2rem] p-3">
              <div className="grid gap-3 lg:grid-cols-[8rem_12rem_8.5rem_11rem_11rem_auto]">
                <input
                  className="field"
                  type="number"
                  min="1"
                  name="min_pitches"
                  defaultValue={minPitches}
                  placeholder="Min pitches"
                />
                <select className="field" name="sort" defaultValue={sort}>
                  <option value="total_dva">Sort by total DVA</option>
                  <option value="avg_dva">Sort by avg DVA</option>
                </select>
                <input
                  className="field"
                  type="number"
                  min="2008"
                  name="season"
                  defaultValue={Number.isFinite(season) ? season : response.season}
                />
                <input className="field" type="date" name="date_from" defaultValue={dateFrom} />
                <input className="field" type="date" name="date_to" defaultValue={dateTo} />
                <button className="button-primary px-5 py-3 text-sm">Refresh board</button>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link href="/" className="button-secondary px-4 py-3 text-sm">
                  Open catcher dashboard
                </Link>
              </div>
            </form>
          </div>

          <aside className="panel-dark overflow-hidden rounded-[1.55rem] p-5 text-white sm:p-6">
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-white/56">
              Season board
            </div>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <div className="font-serif text-[2.8rem] leading-none">{response.season}</div>
                <div className="mt-3 text-sm text-white/72">
                  {leaderboard.length} qualifying catchers on the current filter set
                </div>
              </div>
              <div className="rounded-[1.25rem] border border-white/10 bg-white/7 px-4 py-3">
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
                  Board leader
                </div>
                <div className="mt-2 text-lg font-semibold">
                  {leader?.catcher_name ?? "No qualified catcher"}
                </div>
                <div className="mt-2 text-sm text-white/72">{leader?.team ?? "FA"}</div>
              </div>
              <div className="scorebug rounded-[1.2rem] border border-white/10 px-4 py-3">
                <div className="text-[0.64rem] uppercase tracking-[0.18em] text-white/56">
                  Top total DVA
                </div>
                <div className="numeric mt-2 text-2xl font-semibold">
                  {formatSigned(leader?.total_dva, 3)}
                </div>
                <div className="mt-2 text-sm text-white/72">
                  {leader?.grades.overall_game_calling.label ?? "Unscored"}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <SectionCard
        eyebrow="Board Snapshot"
        title="Top of the scouting board"
        subtitle="Horizontal board view of the best total DVA catcher seasons currently matching your filters."
      >
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <LeaderboardChart entries={leaderboard.slice(0, 8)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {leaderboard.slice(0, 4).map((entry, index) => (
              <Link
                key={entry.catcher_id}
                href={`/?catcher_id=${entry.catcher_id}&season=${entry.season}`}
                className="rounded-[1.25rem] border border-line/60 bg-white/78 p-4 transition hover:-translate-y-0.5 hover:border-accent/24"
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
              </Link>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Leaderboard Table"
        title="Full catcher ranking board"
        subtitle="Scouting-board table with clear rank treatment, grade context, and public catcher support metrics."
        tone="quiet"
      >
        {leaderboard.length === 0 ? (
          <div className="rounded-[1.6rem] border border-dashed border-line/70 bg-white/50 p-6 text-sm leading-7 text-muted">
            No real scored catchers matched the current filters for season {response.season}. Lower
            the minimum pitch threshold, widen the date range, or switch to a populated scored
            season.
          </div>
        ) : (
          <div className="space-y-3">
            {leaderboard.map((entry, index) => (
              <Link
                key={entry.catcher_id}
                href={`/?catcher_id=${entry.catcher_id}&season=${entry.season}`}
                className="grid gap-4 rounded-[1.3rem] border border-line/60 bg-white/78 p-4 transition hover:-translate-y-0.5 hover:border-accent/24 md:grid-cols-[4rem_1.6fr_.95fr_.9fr_.9fr_1.1fr_1fr_1fr]"
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
                    Execution
                  </div>
                  <div className="numeric mt-2 text-xl font-semibold text-ink">
                    {formatSigned(entry.avg_execution_gap, 5)}
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
                    Overall Grade
                  </div>
                  <div className="numeric mt-2 text-xl font-semibold text-ink">
                    {entry.grades.overall_game_calling.score?.toFixed(1) ?? "--"}
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                    {entry.grades.overall_game_calling.label ?? "Unscored"}
                  </div>
                </div>
                <div>
                  <div className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted">
                    Public Support
                  </div>
                  <div className="mt-2 text-sm leading-6 text-muted">
                    Framing {entry.public_metrics.framing_runs == null ? "N/A" : entry.public_metrics.framing_runs.toFixed(2)}
                  </div>
                  <div className="text-sm leading-6 text-muted">
                    Pop 2B {entry.public_metrics.pop_time_2b == null ? "N/A" : entry.public_metrics.pop_time_2b.toFixed(2)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>

      <ApiDebugPanel apiBaseUrl={apiTransportLabel} items={[healthStatus, leaderboardStatus]} />
    </div>
  );
}
