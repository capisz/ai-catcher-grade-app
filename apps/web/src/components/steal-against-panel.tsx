import type { StealAgainstCountSummary, StealAgainstSummary } from "@catcher-intel/contracts";

import { MetricCard } from "@/components/metric-card";

const BALLS = [0, 1, 2, 3];
const STRIKES = [0, 1, 2];

function formatPct(value: number | null | undefined, digits = 1) {
  if (value == null) {
    return "--";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function formatSignedPct(value: number | null | undefined, digits = 1) {
  if (value == null) {
    return "--";
  }
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null) {
    return "--";
  }
  return value.toFixed(digits);
}

function keyFor(balls: number, strikes: number) {
  return `${balls}-${strikes}`;
}

function contextLabel(row: StealAgainstCountSummary) {
  if (row.putaway_flag) {
    return "Put-away";
  }
  if (row.pitcher_friendly_flag) {
    return "Pitcher-friendly";
  }
  if (row.hitter_friendly_flag) {
    return "Hitter-friendly";
  }
  return "Neutral";
}

function cellClasses(row: StealAgainstCountSummary) {
  const tone =
    row.throw_out_rate_delta != null && row.throw_out_rate_delta >= 0.08
      ? "card-tone-sage"
      : row.throw_out_rate_delta != null && row.throw_out_rate_delta > 0
        ? "bg-positive-soft"
        : row.throw_out_rate_delta != null && row.throw_out_rate_delta <= -0.08
          ? "card-tone-clay"
          : row.throw_out_rate_delta != null && row.throw_out_rate_delta < 0
            ? "bg-negative-soft"
            : "surface-panel";
  const volume =
    row.attempt_share != null && row.attempt_share >= 0.2
      ? "shadow-[0_18px_34px_rgba(15,23,42,0.12)]"
      : row.attempt_share != null && row.attempt_share >= 0.1
        ? "shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
        : "";

  return [
    "rounded-lg border p-3 transition",
    tone,
    volume,
    row.low_sample || row.attempts === 0 ? "border-dashed opacity-78 saturate-[0.84]" : "border-line/65",
  ].join(" ");
}

function buildTooltip(row: StealAgainstCountSummary) {
  return [
    `${row.count_state} | ${contextLabel(row)}`,
    `Attempts: ${row.attempts.toLocaleString()}`,
    `Caught stealing: ${row.caught_stealing.toLocaleString()}`,
    `Stolen bases: ${row.stolen_bases.toLocaleString()}`,
    `Throw-out rate: ${formatPct(row.throw_out_rate)}`,
    `Vs season baseline: ${formatSignedPct(row.throw_out_rate_delta)}`,
    `Sample: ${row.sample_label ?? "Unavailable"}`,
  ].join("\n");
}

function topCounts(rows: StealAgainstCountSummary[]) {
  return [...rows]
    .filter((row) => row.attempts > 0)
    .sort((left, right) => right.attempts - left.attempts || (right.attempt_share ?? 0) - (left.attempt_share ?? 0))
    .slice(0, 6);
}

type StealAgainstPanelProps = {
  summary?: StealAgainstSummary | null;
};

export function StealAgainstPanel({ summary }: StealAgainstPanelProps) {
  const rows = summary?.count_summaries ?? [];
  const byCount = new Map(rows.map((row) => [row.count_state, row]));
  const activeRows = rows.filter((row) => row.attempts > 0);
  const mostTested = [...activeRows].sort((left, right) => right.attempts - left.attempts)[0];
  const bestDelta = [...activeRows]
    .filter((row) => row.throw_out_rate_delta != null)
    .sort((left, right) => (right.throw_out_rate_delta ?? 0) - (left.throw_out_rate_delta ?? 0))[0];
  const worstDelta = [...activeRows]
    .filter((row) => row.throw_out_rate_delta != null)
    .sort((left, right) => (left.throw_out_rate_delta ?? 0) - (right.throw_out_rate_delta ?? 0))[0];

  if (!summary) {
    return (
      <div className="surface-panel rounded-xl p-5 text-sm leading-6 text-muted">
        Running-game data is unavailable for this catcher-season response.
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.06fr_0.94fr]">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="meta-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-muted">
            Exact-count steal pressure
          </span>
          <span className="meta-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-muted">
            Color = throw-out delta vs season
          </span>
          <span className="meta-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-muted">
            Dashed = low running-game sample
          </span>
        </div>

        <div className="grid grid-cols-[4.15rem_repeat(3,minmax(0,1fr))] gap-2">
          <div />
          {STRIKES.map((strike) => (
            <div
              key={strike}
              className="meta-pill rounded-lg px-3 py-2 text-center text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-muted"
            >
              {strike} strike{strike === 1 ? "" : "s"}
            </div>
          ))}

          {BALLS.map((ball) => (
            <div key={ball} className="contents">
              <div className="meta-pill flex items-center justify-center rounded-lg px-2 py-3 text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-muted">
                {ball} ball{ball === 1 ? "" : "s"}
              </div>
              {STRIKES.map((strike) => {
                const row = byCount.get(keyFor(ball, strike));
                if (!row) {
                  return (
                    <div
                      key={keyFor(ball, strike)}
                      className="rounded-lg border border-dashed border-line/70 bg-surface/70 p-3 text-center text-xs text-muted"
                    >
                      No data
                    </div>
                  );
                }

                return (
                  <div key={row.count_state} title={buildTooltip(row)} className={cellClasses(row)}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-ink">{row.count_state}</div>
                        <div className="mt-1 text-[0.58rem] uppercase tracking-[0.06em] text-muted">
                          {contextLabel(row)}
                        </div>
                      </div>
                      <div className="text-right text-[0.58rem] uppercase tracking-[0.06em] text-muted">
                        {row.attempts > 0 ? `${row.attempts} att` : "No att"}
                      </div>
                    </div>

                    <div className="numeric mt-4 text-lg font-semibold leading-none text-ink">
                      {formatSignedPct(row.throw_out_rate_delta)}
                    </div>
                    <div className="mt-2 text-xs leading-6 text-muted">
                      TO% {formatPct(row.throw_out_rate)} | Share {formatPct(row.attempt_share)}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="surface-panel rounded-xl p-4">
          <div className="text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-muted">
            Interpretation note
          </div>
          <p className="mt-3 text-sm leading-6 text-muted">
            {summary.note ??
              "These counts come from public Statcast pitch descriptions. They reflect running-game outcomes recorded on the pitch, not a pure isolated catcher-arm model."}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard
            label="Steal attempts"
            value={summary.attempts.toLocaleString()}
            note="All steal and caught-stealing outcomes parsed from described pitches against this catcher."
          />
          <MetricCard
            label="Throw-out rate"
            value={formatPct(summary.throw_out_rate)}
            note={`${summary.caught_stealing.toLocaleString()} caught | ${summary.stolen_bases.toLocaleString()} safe`}
          />
          <MetricCard
            label="Vs season baseline"
            value={formatSignedPct(summary.throw_out_rate_delta)}
            note={`Season-wide throw-out rate in described attempts: ${formatPct(summary.baseline_throw_out_rate)}`}
          />
          <MetricCard
            label="Public pop time 2B"
            value={formatNumber(summary.pop_time_2b)}
            note={
              summary.pop_2b_attempts != null
                ? `${summary.pop_2b_attempts.toLocaleString()} public pop-time tracked attempts`
                : "Public Savant pop-time context."
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="surface-panel rounded-xl p-4">
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-muted">
              Most tested count
            </div>
            <div className="mt-3 font-serif text-lg leading-none text-ink">
              {mostTested?.count_state ?? "No tries"}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              {mostTested
                ? `${mostTested.attempts} attempts | ${formatPct(mostTested.attempt_share)} of this catcher's steal pressure`
                : "No described attempts against this catcher yet."}
            </p>
          </div>
          <div className="surface-panel rounded-xl p-4">
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-muted">
              Best throw-out delta
            </div>
            <div className="mt-3 font-serif text-lg leading-none text-ink">
              {bestDelta?.count_state ?? "No edge"}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              {bestDelta
                ? `${formatSignedPct(bestDelta.throw_out_rate_delta)} vs season with ${formatPct(bestDelta.throw_out_rate)} throw-out rate`
                : "No count has enough described attempts to show a delta yet."}
            </p>
          </div>
          <div className="surface-panel rounded-xl p-4">
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-muted">
              Weakest pressure count
            </div>
            <div className="mt-3 font-serif text-lg leading-none text-ink">
              {worstDelta?.count_state ?? "No gap"}
            </div>
            <p className="mt-2 text-sm leading-6 text-muted">
              {worstDelta
                ? `${formatSignedPct(worstDelta.throw_out_rate_delta)} vs season in the toughest exposed running-game pocket`
                : "No negative count delta has formed yet."}
            </p>
          </div>
        </div>

        <div className="surface-panel overflow-hidden rounded-xl">
          <div className="flex items-center justify-between gap-4 border-b border-line/60 px-4 py-3">
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-muted">
              Count-by-count table
            </div>
            <div className="text-xs text-muted">
              Pop CS {formatNumber(summary.pop_time_2b_cs)} | Pop SB {formatNumber(summary.pop_time_2b_sb)}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface/70 text-[0.66rem] uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Count</th>
                  <th className="px-4 py-3 font-semibold">Attempts</th>
                  <th className="px-4 py-3 font-semibold">Caught</th>
                  <th className="px-4 py-3 font-semibold">TO%</th>
                  <th className="px-4 py-3 font-semibold">Delta</th>
                </tr>
              </thead>
              <tbody>
                {topCounts(rows).map((row) => (
                  <tr key={row.count_state} className="border-t border-line/50">
                    <td className="px-4 py-3 font-semibold text-ink">{row.count_state}</td>
                    <td className="px-4 py-3 text-muted">{row.attempts.toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted">{row.caught_stealing.toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted">{formatPct(row.throw_out_rate)}</td>
                    <td className="px-4 py-3 text-muted">{formatSignedPct(row.throw_out_rate_delta)}</td>
                  </tr>
                ))}
                {topCounts(rows).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted">
                      No described steal attempts were found for this catcher in the current season slice.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
