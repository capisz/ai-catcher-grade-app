"use client";

import { useState } from "react";
import type { CountSummary } from "@catcher-intel/contracts";

import { LoadingLink } from "@/components/ui/loading-link";

const BALLS = [0, 1, 2, 3];
const STRIKES = [0, 1, 2];

function formatSigned(value: number | null | undefined, digits = 4) {
  if (value == null) {
    return "--";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function formatPct(value: number | null | undefined, digits = 1) {
  if (value == null) {
    return "--";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function keyFor(balls: number, strikes: number) {
  return `${balls}-${strikes}`;
}

function cellClasses(row: CountSummary, selected: boolean) {
  const base =
    row.avg_dva >= 0.008
      ? "bg-brand-primary text-white border-brand-primary/24"
      : row.avg_dva >= 0.002
        ? "bg-brand-sage/35 text-ink border-brand-sage/40"
        : row.avg_dva <= -0.008
          ? "bg-accent-clay text-white border-accent-clay/24"
          : row.avg_dva <= -0.002
            ? "bg-brand-sand/28 text-accent-clay border-brand-sand/38"
            : "bg-surface-raised/84 text-ink border-line/70";

  return [
    base,
    row.low_sample ? "border-dashed opacity-80 saturate-[0.82]" : "",
    selected ? "ring-2 ring-accent/35 shadow-[0_18px_32px_rgba(68,83,95,0.12)]" : "",
  ].join(" ");
}

function contextLabel(row: CountSummary) {
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

function toneChip(row: CountSummary) {
  if (row.putaway_flag) {
    return "border-brand-secondary/24 bg-brand-secondary/10 text-accent-clay";
  }
  if (row.pitcher_friendly_flag) {
    return "border-brand-primary/20 bg-brand-primary/10 text-ink";
  }
  if (row.hitter_friendly_flag) {
    return "border-accent-clay/20 bg-accent-clay/10 text-accent-clay";
  }
  return "border-line/70 bg-surface/70 text-muted";
}

function chooseHighlight(
  rows: CountSummary[],
  minimumPitches: number,
  predicate: (row: CountSummary) => boolean,
  direction: "best" | "worst",
) {
  const filtered = rows.filter((row) => predicate(row) && row.pitches >= minimumPitches);
  const source = filtered.length > 0 ? filtered : rows.filter(predicate);
  if (source.length === 0) {
    return undefined;
  }
  return [...source].sort((left, right) =>
    direction === "best" ? right.avg_dva - left.avg_dva : left.avg_dva - right.avg_dva,
  )[0];
}

function buildTooltip(row: CountSummary) {
  return [
    `${row.split_value} | ${contextLabel(row)}`,
    `Pitches: ${row.pitches.toLocaleString()}`,
    `Total DVA: ${formatSigned(row.total_dva, 3)}`,
    `Avg DVA: ${formatSigned(row.avg_dva, 4)}`,
    `Outperform: ${formatPct(row.outperform_rate)}`,
    `Sample: ${row.sample_label ?? "Unavailable"}`,
  ].join("\n");
}

type CountStateMatrixProps = {
  rows: CountSummary[];
  selectedCount?: string;
  hrefByCount?: Record<string, string>;
  highlightMinimumPitches?: number;
};

export function CountStateMatrix({
  rows,
  selectedCount,
  hrefByCount = {},
  highlightMinimumPitches = 20,
}: CountStateMatrixProps) {
  const [activeCount, setActiveCount] = useState<string | null>(null);

  const byCount = new Map(rows.map((row) => [row.split_value, row]));
  const activeKey = activeCount ?? selectedCount ?? rows[0]?.split_value ?? "";
  const activeRow =
    byCount.get(activeKey) ??
    (selectedCount ? byCount.get(selectedCount) : undefined) ??
    rows[0];

  const bestCount = chooseHighlight(rows, highlightMinimumPitches, () => true, "best");
  const worstCount = chooseHighlight(rows, highlightMinimumPitches, () => true, "worst");
  const strongestPitcherFriendly = chooseHighlight(
    rows,
    highlightMinimumPitches,
    (row) => row.pitcher_friendly_flag || row.putaway_flag,
    "best",
  );
  const weakestHitterFriendly = chooseHighlight(
    rows,
    highlightMinimumPitches,
    (row) => row.hitter_friendly_flag,
    "worst",
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="meta-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">
          Avg DVA by exact count
        </span>
        <span className="meta-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">
          Hover or tap for detail
        </span>
        <span className="meta-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">
          Dashed = low split sample
        </span>
      </div>

      <div className="grid grid-cols-[4.2rem_repeat(3,minmax(0,1fr))] gap-2">
        <div />
        {STRIKES.map((strike) => (
          <div
            key={strike}
            className="meta-pill rounded-[1rem] px-3 py-2 text-center text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted"
          >
            {strike} strike{strike === 1 ? "" : "s"}
          </div>
        ))}

        {BALLS.map((ball) => (
          <div key={ball} className="contents">
            <div className="meta-pill flex items-center justify-center rounded-[1rem] px-2 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted">
              {ball} ball{ball === 1 ? "" : "s"}
            </div>
            {STRIKES.map((strike) => {
              const countKey = keyFor(ball, strike);
              const row = byCount.get(countKey);

              if (!row) {
                return (
                  <div
                    key={countKey}
                    className="rounded-[1.15rem] border border-dashed border-line/70 bg-surface/70 p-4 text-center text-xs text-muted"
                  >
                    No data
                  </div>
                );
              }

              const content = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{row.split_value}</div>
                      <div className="mt-2 text-[0.6rem] uppercase tracking-[0.18em] opacity-70">
                        {row.pitches.toLocaleString()} pitches
                      </div>
                    </div>
                    {row.low_sample ? (
                      <span className="rounded-full border border-current/14 px-2 py-1 text-[0.52rem] font-semibold uppercase tracking-[0.16em]">
                        Low sample
                      </span>
                    ) : null}
                  </div>

                  <div className="numeric mt-4 text-[1.85rem] font-semibold leading-none">
                    {formatSigned(row.avg_dva, 4)}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span
                      className={[
                        "rounded-full border px-2 py-1 text-[0.55rem] font-semibold uppercase tracking-[0.16em]",
                        toneChip(row),
                      ].join(" ")}
                    >
                      {contextLabel(row)}
                    </span>
                    {row.recommended_pitch_family ? (
                      <span className="rounded-full border border-current/14 px-2 py-1 text-[0.55rem] font-semibold uppercase tracking-[0.16em]">
                        {row.recommended_pitch_family}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 text-xs leading-6 opacity-80">
                    Outperform {formatPct(row.outperform_rate)} | {row.sample_label ?? "Sample unknown"}
                  </div>
                </>
              );

              const className = [
                "min-h-[11rem] rounded-[1.1rem] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition",
                cellClasses(row, selectedCount === row.split_value || activeKey === row.split_value),
              ].join(" ");
              const href = hrefByCount[row.split_value];

              if (!href) {
                return (
                  <button
                    key={row.split_value}
                    type="button"
                    title={buildTooltip(row)}
                    onMouseEnter={() => setActiveCount(row.split_value)}
                    onFocus={() => setActiveCount(row.split_value)}
                    className={[className, "text-left"].join(" ")}
                  >
                    {content}
                  </button>
                );
              }

              return (
                <LoadingLink
                  key={row.split_value}
                  href={href}
                  title={buildTooltip(row)}
                  loadingMessage="Loading count-state breakdown..."
                  loadingSubtitle={`Focusing the scouting view on count ${row.split_value}.`}
                  onMouseEnter={() => setActiveCount(row.split_value)}
                  onFocus={() => setActiveCount(row.split_value)}
                  className={[className, "block"].join(" ")}
                >
                  {content}
                </LoadingLink>
              );
            })}
          </div>
        ))}
      </div>

      {activeRow ? (
        <div className="surface-panel rounded-[1.35rem] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="label-kicker">Active count preview</div>
              <div className="mt-3 font-serif text-[2rem] leading-none text-ink">
                {activeRow.split_value}
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
                {activeRow.pitches.toLocaleString()} pitches in this exact count. This cell uses
                avg DVA per pitch, with outperform rate and pitch-family guidance shown below.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="meta-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">
                {contextLabel(activeRow)}
              </span>
              <span className="meta-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">
                {activeRow.sample_label ?? "Sample unknown"}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[1rem] border border-line/60 bg-surface/72 p-4">
              <div className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted">
                Avg DVA
              </div>
              <div className="numeric mt-2 text-[1.8rem] font-semibold text-ink">
                {formatSigned(activeRow.avg_dva, 4)}
              </div>
            </div>
            <div className="rounded-[1rem] border border-line/60 bg-surface/72 p-4">
              <div className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted">
                Total DVA
              </div>
              <div className="numeric mt-2 text-[1.8rem] font-semibold text-ink">
                {formatSigned(activeRow.total_dva, 3)}
              </div>
            </div>
            <div className="rounded-[1rem] border border-line/60 bg-surface/72 p-4">
              <div className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted">
                Outperform
              </div>
              <div className="numeric mt-2 text-[1.8rem] font-semibold text-ink">
                {formatPct(activeRow.outperform_rate)}
              </div>
            </div>
            <div className="rounded-[1rem] border border-line/60 bg-surface/72 p-4">
              <div className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted">
                Pitch-family read
              </div>
              <div className="mt-2 text-[1.25rem] font-semibold text-ink">
                {activeRow.recommended_pitch_family ?? "--"}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Best count",
            row: bestCount,
          },
          {
            label: "Worst count",
            row: worstCount,
          },
          {
            label: "Best pitcher-friendly / put-away",
            row: strongestPitcherFriendly,
          },
          {
            label: "Weakest hitter-friendly",
            row: weakestHitterFriendly,
          },
        ].map((item) => (
          <div key={item.label} className="surface-panel rounded-[1.25rem] p-4">
            <div className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted">
              {item.label}
            </div>
            <div className="mt-3 font-serif text-[1.55rem] leading-none text-ink">
              {item.row?.split_value ?? "No read"}
            </div>
            <div className="numeric mt-3 text-xl font-semibold text-ink">
              {item.row ? formatSigned(item.row.avg_dva, 4) : "--"}
            </div>
            <div className="mt-2 text-sm leading-6 text-muted">
              {item.row
                ? `${item.row.pitches.toLocaleString()} pitches | ${formatPct(item.row.outperform_rate)} outperform`
                : "Not enough count-state data yet."}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
        <span>Clay = worse than baseline</span>
        <div className="h-2.5 w-28 rounded-full bg-gradient-to-r from-accent-clay via-brand-sand/40 to-brand-primary" />
        <span>Slate = better than baseline</span>
      </div>
    </div>
  );
}
