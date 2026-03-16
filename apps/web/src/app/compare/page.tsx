import type {
  CatcherComparisonResponse,
  CatcherDetailResponse,
  CountSummary,
  PitchTypeSummary,
} from "@catcher-intel/contracts";
import Image from "next/image";

import { ApiDebugPanel } from "@/components/api-debug-panel";
import { CompareCountStatePanel } from "@/components/compare-count-state-panel";
import { ComparisonTable } from "@/components/comparison-table";
import { DataFreshnessPanel } from "@/components/data-freshness-panel";
import { EmptyStatePanel } from "@/components/empty-state-panel";
import { PairingDvaChart } from "@/components/pairing-dva-chart";
import { PitchTypeDvaChart } from "@/components/pitch-type-dva-chart";
import { ProductStatusStrip } from "@/components/product-status-strip";
import { SampleStabilityBadge } from "@/components/sample-stability-badge";
import { SectionCard } from "@/components/section-card";
import { LoadingForm } from "@/components/ui/loading-form";
import { LoadingLink } from "@/components/ui/loading-link";
import {
  ApiRequestError,
  getApiHealth,
  getApiTransport,
  getAppMetadata,
  getCatcherComparison,
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
  const text = readString(value, "").trim();
  if (!text) {
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

function formatPct(value: number | null | undefined, digits = 1) {
  if (value == null) {
    return "--";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function formatPctDelta(valueA: number | null | undefined, valueB: number | null | undefined) {
  if (valueA == null || valueB == null) {
    return "--";
  }
  const delta = (valueA - valueB) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts`;
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null) {
    return "--";
  }
  return value.toFixed(digits);
}

function formatInt(value: number | null | undefined) {
  if (value == null) {
    return "--";
  }
  return Math.round(value).toLocaleString();
}

function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown comparison loading error.";
}

function debugErrorDetail(error: unknown) {
  if (error instanceof ApiRequestError) {
    return error.status == null ? error.message : `HTTP ${error.status} | ${error.message}`;
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

function shortName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

function leadForNumbers(
  valueA: number | null | undefined,
  valueB: number | null | undefined,
  higherIsBetter = true,
) {
  if (valueA == null || valueB == null) {
    return undefined;
  }
  if (Math.abs(valueA - valueB) < 1e-9) {
    return "tie" as const;
  }
  if (higherIsBetter) {
    return valueA > valueB ? ("a" as const) : ("b" as const);
  }
  return valueA < valueB ? ("a" as const) : ("b" as const);
}

function numericRow(
  label: string,
  valueA: number | null | undefined,
  valueB: number | null | undefined,
  options: {
    formatValue?: (value: number | null | undefined) => string;
    formatDelta?: (valueA: number | null | undefined, valueB: number | null | undefined) => string;
    higherIsBetter?: boolean;
    note?: string;
  } = {},
) {
  const formatValue = options.formatValue ?? ((value) => formatSigned(value));
  const formatDelta =
    options.formatDelta ??
    ((left, right) => {
      if (left == null || right == null) {
        return "--";
      }
      return formatSigned(left - right, 3);
    });

  return {
    label,
    catcherA: formatValue(valueA),
    catcherB: formatValue(valueB),
    delta: formatDelta(valueA, valueB),
    lead: leadForNumbers(valueA, valueB, options.higherIsBetter ?? true),
    note: options.note,
  };
}

function filteredPitchTypes(rows: PitchTypeSummary[], minPitches: number) {
  const filtered = rows.filter((row) => row.pitches >= minPitches);
  return filtered.length > 0 ? filtered.slice(0, 6) : rows.slice(0, 6);
}

function filteredCounts(rows: CountSummary[], minPitches: number, splitType: "count_state" | "count_bucket") {
  const subset = rows.filter((row) => row.split_type === splitType);
  const filtered = subset.filter((row) => row.pitches >= minPitches);
  return filtered.length > 0 ? filtered : subset;
}

function strongestCount(rows: CountSummary[], minPitches: number, direction: "best" | "worst") {
  const filtered = rows.filter((row) => row.pitches >= minPitches);
  const source = filtered.length > 0 ? filtered : rows;
  if (source.length === 0) {
    return undefined;
  }
  return [...source].sort((left, right) =>
    direction === "best" ? right.avg_dva - left.avg_dva : left.avg_dva - right.avg_dva,
  )[0];
}

function bucketLookup(rows: CountSummary[]) {
  return new Map(rows.map((row) => [row.split_value, row]));
}

function pitcherTopline(detail: CatcherDetailResponse) {
  return detail.pairings.slice(0, 5);
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const requestedSeason = readNumber(params.season);
  const minPitches = Math.max(readNumber(params.min_pitches, 50) ?? 50, 1);
  const dateFrom = readString(params.date_from, "");
  const dateTo = readString(params.date_to, "");
  const requestedTeam = readString(params.team, "").toUpperCase();
  const requestedA = readNumber(params.catcher_a);
  const requestedB = readNumber(params.catcher_b);
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
        eyebrow="Compare Offline"
        title="Comparison mode cannot load app metadata"
        description={errorMessage(error)}
        detail={`Targeted backend: ${apiTransport.backendBaseUrl} (${apiTransport.configuredFrom}). Start the API there or update API_BASE_URL before retrying.`}
        tone="caution"
      />
    );
  }

  let catchers;
  try {
    catchers = await getCatchers({
      season: metadata.selected_season,
      team: requestedTeam || undefined,
    });
  } catch (error) {
    return (
      <EmptyStatePanel
        eyebrow="Compare Offline"
        title="Comparison mode cannot load catcher options"
        description={errorMessage(error)}
        detail={`Targeted backend: ${apiTransport.backendBaseUrl} (${apiTransport.configuredFrom}). Start the API there or update API_BASE_URL before retrying.`}
        tone="caution"
      />
    );
  }

  if (catchers.catchers.length < 2) {
    return (
      <EmptyStatePanel
        eyebrow="Not Enough Catchers"
        title="Comparison mode needs at least two catcher rows"
        description={`Season ${metadata.selected_season}${requestedTeam ? ` for team ${requestedTeam}` : ""} does not currently have two real catcher rows available.`}
        detail={metadata.season_coverage_note}
        tone="caution"
      />
    );
  }

  const leaderboard = await getLeaderboard({
    season: metadata.selected_season,
    minPitches,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    team: requestedTeam || undefined,
  }).catch(() => null);

  const orderedIds = [
    ...(leaderboard?.leaderboard.map((row) => row.catcher_id) ?? []),
    ...catchers.catchers.map((row) => row.catcher_id),
  ];
  const defaultA =
    catchers.catchers.find((row) => row.catcher_id === requestedA)?.catcher_id ??
    orderedIds[0] ??
    catchers.catchers[0]?.catcher_id;
  const defaultB =
    catchers.catchers.find((row) => row.catcher_id === requestedB && row.catcher_id !== defaultA)?.catcher_id ??
    orderedIds.find((value) => value !== defaultA) ??
    catchers.catchers.find((row) => row.catcher_id !== defaultA)?.catcher_id;

  if (!defaultA || !defaultB) {
    return (
      <EmptyStatePanel
        eyebrow="Not Enough Catchers"
        title="Comparison mode could not resolve two distinct catchers"
        description="Try clearing the team or date filters to widen the comparison pool."
        detail={metadata.season_coverage_note}
        tone="caution"
      />
    );
  }

  const sameCatcherRequested = requestedA != null && requestedB != null && requestedA === requestedB;

  let comparison: CatcherComparisonResponse;
  try {
    comparison = await getCatcherComparison({
      catcherA: defaultA,
      catcherB: defaultB,
      season: metadata.selected_season,
      minPitches,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      team: requestedTeam || undefined,
    });
  } catch (error) {
    return (
      <EmptyStatePanel
        eyebrow="Compare Unavailable"
        title="The catcher comparison payload could not be loaded"
        description={errorMessage(error)}
        detail={`Targeted backend: ${apiTransport.backendBaseUrl} (${apiTransport.configuredFrom}). Comparison mode requires real scored rows for both catchers under the same filter context.`}
        tone="caution"
        action={
          <ApiDebugPanel
            transport={apiTransport}
            items={[
              healthStatus,
              {
                label: "Comparison",
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

  const catcherA = comparison.catcher_a;
  const catcherB = comparison.catcher_b;
  const aLabel = shortName(catcherA.identity.catcher_name);
  const bLabel = shortName(catcherB.identity.catcher_name);

  const swapHref = buildHref("/compare", {
    catcher_a: catcherB.identity.catcher_id,
    catcher_b: catcherA.identity.catcher_id,
    season: metadata.selected_season,
    min_pitches: minPitches,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    team: requestedTeam || undefined,
  });

  const leaderboardLeader = leaderboard?.leaderboard.find(
    (row) =>
      row.catcher_id !== catcherA.identity.catcher_id &&
      row.catcher_id !== catcherB.identity.catcher_id,
  );
  const compareLeaderHref = leaderboardLeader
    ? buildHref("/compare", {
        catcher_a: catcherA.identity.catcher_id,
        catcher_b: leaderboardLeader.catcher_id,
        season: metadata.selected_season,
        min_pitches: minPitches,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        team: requestedTeam || undefined,
      })
    : "";

  const summaryRows = [
    numericRow("Total DVA", catcherA.total_dva, catcherB.total_dva, {
      formatValue: (value) => formatSigned(value, 3),
      note: "Season/context total decision value added.",
    }),
    numericRow("Avg DVA", catcherA.avg_dva, catcherB.avg_dva, {
      formatValue: (value) => formatSigned(value, 5),
      formatDelta: (valueA, valueB) =>
        valueA == null || valueB == null ? "--" : formatSigned(valueA - valueB, 5),
      note: "Per-pitch value versus the weighted baseline.",
    }),
    numericRow("Avg execution gap", catcherA.avg_execution_gap, catcherB.avg_execution_gap, {
      formatValue: (value) => formatSigned(value, 4),
      formatDelta: (valueA, valueB) =>
        valueA == null || valueB == null ? "--" : formatSigned(valueA - valueB, 4),
      note: "Outcome gap between observed and modeled pitch idea.",
    }),
    numericRow(
      "Outperformed baseline",
      catcherA.diagnostics.outperform_rate,
      catcherB.diagnostics.outperform_rate,
      {
        formatValue: (value) => formatPct(value),
        formatDelta: formatPctDelta,
        note: "Share of pitches that beat the public baseline option set.",
      },
    ),
    numericRow("Pitch count", catcherA.total_pitches, catcherB.total_pitches, {
      formatValue: (value) => formatInt(value),
      formatDelta: (valueA, valueB) =>
        valueA == null || valueB == null ? "--" : `${Math.round(valueA - valueB) >= 0 ? "+" : ""}${Math.round(valueA - valueB).toLocaleString()}`,
      note: `Shared comparison context floor is ${minPitches.toLocaleString()} pitches for split displays.`,
    }),
    numericRow(
      "Games scored",
      catcherA.diagnostics.games_scored,
      catcherB.diagnostics.games_scored,
      {
        formatValue: (value) => formatInt(value),
        formatDelta: (valueA, valueB) =>
          valueA == null || valueB == null ? "--" : `${Math.round(valueA - valueB) >= 0 ? "+" : ""}${Math.round(valueA - valueB)}`,
      },
    ),
  ];

  const gradeRows = [
    {
      label: "Overall Game Calling",
      a: catcherA.grades.overall_game_calling,
      b: catcherB.grades.overall_game_calling,
    },
    {
      label: "Count Leverage",
      a: catcherA.grades.count_leverage,
      b: catcherB.grades.count_leverage,
    },
    {
      label: "Put-Away Count",
      a: catcherA.grades.putaway_count,
      b: catcherB.grades.putaway_count,
    },
    {
      label: "Damage Avoidance",
      a: catcherA.grades.damage_avoidance,
      b: catcherB.grades.damage_avoidance,
    },
    {
      label: "Pitch Mix Synergy",
      a: catcherA.grades.pitch_mix_synergy,
      b: catcherB.grades.pitch_mix_synergy,
    },
    {
      label: "Receiving Support",
      a: catcherA.grades.receiving_support,
      b: catcherB.grades.receiving_support,
    },
  ].map((row) => ({
    label: row.label,
    catcherA: row.a.score == null ? "--" : `${row.a.score.toFixed(1)} | ${row.a.label ?? "Unscored"}`,
    catcherB: row.b.score == null ? "--" : `${row.b.score.toFixed(1)} | ${row.b.label ?? "Unscored"}`,
    delta:
      row.a.score == null || row.b.score == null ? "--" : formatSigned(row.a.score - row.b.score, 1),
    lead: leadForNumbers(row.a.score, row.b.score, true),
    note:
      row.a.population_size != null || row.b.population_size != null
        ? `Qualified population: ${Math.max(row.a.population_size ?? 0, row.b.population_size ?? 0)}`
        : undefined,
  }));

  const countStateRowsA = filteredCounts(catcherA.count_state_summaries, minPitches, "count_state");
  const countStateRowsB = filteredCounts(catcherB.count_state_summaries, minPitches, "count_state");
  const countBucketA = bucketLookup(filteredCounts(catcherA.count_bucket_summaries, minPitches, "count_bucket"));
  const countBucketB = bucketLookup(filteredCounts(catcherB.count_bucket_summaries, minPitches, "count_bucket"));
  const countBucketRows = ["pitcher_ahead", "even", "hitter_ahead", "full_count"].map((bucket) =>
    numericRow(
      bucket.replaceAll("_", " "),
      countBucketA.get(bucket)?.avg_dva,
      countBucketB.get(bucket)?.avg_dva,
      {
        formatValue: (value) => formatSigned(value, 4),
        formatDelta: (valueA, valueB) =>
          valueA == null || valueB == null ? "--" : formatSigned(valueA - valueB, 4),
        note: `${countBucketA.get(bucket)?.pitches?.toLocaleString() ?? 0} vs ${countBucketB.get(bucket)?.pitches?.toLocaleString() ?? 0} pitches`,
      },
    ),
  );

  const pitchTypeRowsA = filteredPitchTypes(catcherA.pitch_type_summaries, minPitches);
  const pitchTypeRowsB = filteredPitchTypes(catcherB.pitch_type_summaries, minPitches);
  const totalPitchA = pitchTypeRowsA.reduce((sum, row) => sum + row.pitches, 0);
  const totalPitchB = pitchTypeRowsB.reduce((sum, row) => sum + row.pitches, 0);
  const pitchTypeMapA = new Map(pitchTypeRowsA.map((row) => [row.pitch_type, row]));
  const pitchTypeMapB = new Map(pitchTypeRowsB.map((row) => [row.pitch_type, row]));
  const pitchTypeUnion = Array.from(new Set([...pitchTypeMapA.keys(), ...pitchTypeMapB.keys()]));
  const pitchTypeCompareRows = pitchTypeUnion.map((pitchType) => {
    const rowA = pitchTypeMapA.get(pitchType);
    const rowB = pitchTypeMapB.get(pitchType);
    const shareA = rowA && totalPitchA ? rowA.pitches / totalPitchA : null;
    const shareB = rowB && totalPitchB ? rowB.pitches / totalPitchB : null;
    return {
      label: pitchType,
      catcherA: rowA ? `${formatSigned(rowA.avg_dva, 4)} | ${formatPct(shareA)}` : "--",
      catcherB: rowB ? `${formatSigned(rowB.avg_dva, 4)} | ${formatPct(shareB)}` : "--",
      delta:
        rowA && rowB ? formatSigned(rowA.avg_dva - rowB.avg_dva, 4) : "--",
      lead: leadForNumbers(rowA?.avg_dva, rowB?.avg_dva, true),
      note:
        rowA || rowB
          ? `Outperform ${formatPct(rowA?.outperform_rate)} vs ${formatPct(rowB?.outperform_rate)}`
          : undefined,
    };
  });

  const publicMetricRows = [
    numericRow("Framing runs", catcherA.public_metrics.framing_runs, catcherB.public_metrics.framing_runs, {
      formatValue: (value) => formatNumber(value, 2),
    }),
    numericRow("Blocking runs", catcherA.public_metrics.blocking_runs, catcherB.public_metrics.blocking_runs, {
      formatValue: (value) => formatNumber(value, 2),
    }),
    numericRow(
      "Blocks above average",
      catcherA.public_metrics.blocks_above_average,
      catcherB.public_metrics.blocks_above_average,
      {
        formatValue: (value) => formatNumber(value, 2),
      },
    ),
    numericRow("Pop time 2B", catcherA.public_metrics.pop_time_2b, catcherB.public_metrics.pop_time_2b, {
      formatValue: (value) => formatNumber(value, 2),
      higherIsBetter: false,
    }),
    numericRow("Arm overall", catcherA.public_metrics.arm_overall, catcherB.public_metrics.arm_overall, {
      formatValue: (value) => formatNumber(value, 2),
    }),
    numericRow(
      "Max arm strength",
      catcherA.public_metrics.max_arm_strength,
      catcherB.public_metrics.max_arm_strength,
      {
        formatValue: (value) => formatNumber(value, 1),
      },
    ),
  ];

  const diagnosticRows = [
    numericRow(
      "Avg surviving candidate count",
      catcherA.diagnostics.avg_surviving_candidate_count,
      catcherB.diagnostics.avg_surviving_candidate_count,
      {
        formatValue: (value) => formatNumber(value, 2),
        note: "Higher means more real alternatives survived the context filters.",
      },
    ),
    numericRow(
      "Single-candidate rate",
      catcherA.diagnostics.single_candidate_pct,
      catcherB.diagnostics.single_candidate_pct,
      {
        formatValue: (value) => formatPct(value),
        formatDelta: formatPctDelta,
        higherIsBetter: false,
      },
    ),
    numericRow(
      "Sparse-context drop rate",
      catcherA.diagnostics.dropped_sparse_context_pct,
      catcherB.diagnostics.dropped_sparse_context_pct,
      {
        formatValue: (value) => formatPct(value),
        formatDelta: formatPctDelta,
        higherIsBetter: false,
      },
    ),
    numericRow(
      "Fallback rate",
      catcherA.diagnostics.fallback_context_pct,
      catcherB.diagnostics.fallback_context_pct,
      {
        formatValue: (value) => formatPct(value),
        formatDelta: formatPctDelta,
        higherIsBetter: false,
      },
    ),
  ];

  const strongestA = strongestCount(countStateRowsA, minPitches, "best");
  const weakestA = strongestCount(countStateRowsA, minPitches, "worst");
  const strongestB = strongestCount(countStateRowsB, minPitches, "best");
  const weakestB = strongestCount(countStateRowsB, minPitches, "worst");

  const belowFloor = [catcherA, catcherB].filter((detail) => detail.total_pitches < minPitches);

  const debugItems = [
    healthStatus,
    {
      label: "Comparison",
      status: "ok" as const,
      detail: `${catcherA.identity.catcher_name} vs ${catcherB.identity.catcher_name}`,
    },
    {
      label: "Population",
      status: comparison.population_size >= 2 ? ("ok" as const) : ("warning" as const),
      detail: `${comparison.population_size} catchers | ${comparison.qualified_population_size} qualified`,
    },
  ];

  return (
    <div className="space-y-8">
      <section className="card relative overflow-hidden rounded-[1.6rem] px-5 py-5 sm:px-6 sm:py-6 lg:px-7">
        <div className="hero-wash pointer-events-none absolute inset-x-0 top-0 h-24" />
        <div className="relative grid gap-6 xl:grid-cols-[1.06fr_0.94fr]">
          <div className="space-y-6">
            <div>
              <div className="label-kicker">Compare Mode</div>
              <h1 className="mt-4 max-w-4xl font-serif text-[2.45rem] leading-[0.98] text-ink sm:text-[3.05rem]">
                Side-by-side catcher evaluation built for real scouting decisions.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-8 text-muted">
                Compare two catchers under the same scored context and focus on what actually matters:
                total value, count-state performance, pitch-type tendencies, pairing fit, public support
                metrics, and how stable the sample really is.
              </p>
            </div>

            <ProductStatusStrip metadata={metadata} />

            <LoadingForm
              action="/compare"
              className="shell-panel rounded-[1.25rem] p-4"
              loadingMessage="Loading compare mode..."
              loadingSubtitle="Refreshing both catchers under the same filter context."
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_11rem_8.5rem_11rem_11rem]">
                <label className="min-w-0 space-y-2">
                  <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    Catcher A
                  </span>
                  <select
                    className="field"
                    name="catcher_a"
                    defaultValue={String(catcherA.identity.catcher_id)}
                    data-auto-submit="true"
                  >
                    {catchers.catchers.map((catcher) => (
                      <option
                        key={catcher.catcher_id}
                        value={catcher.catcher_id}
                        disabled={catcher.catcher_id === catcherB.identity.catcher_id}
                      >
                        {catcher.dropdown_label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0 space-y-2">
                  <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    Catcher B
                  </span>
                  <select
                    className="field"
                    name="catcher_b"
                    defaultValue={String(catcherB.identity.catcher_id)}
                    data-auto-submit="true"
                  >
                    {catchers.catchers.map((catcher) => (
                      <option
                        key={catcher.catcher_id}
                        value={catcher.catcher_id}
                        disabled={catcher.catcher_id === catcherA.identity.catcher_id}
                      >
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
                <label className="min-w-0 space-y-2">
                  <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    Date from
                  </span>
                  <input
                    className="field"
                    type="date"
                    name="date_from"
                    defaultValue={dateFrom}
                    data-auto-submit="true"
                  />
                </label>
                <label className="min-w-0 space-y-2">
                  <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    Date to
                  </span>
                  <input
                    className="field"
                    type="date"
                    name="date_to"
                    defaultValue={dateTo}
                    data-auto-submit="true"
                  />
                </label>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
                <label className="min-w-0 space-y-2">
                  <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    Team filter
                  </span>
                  <select className="field" name="team" defaultValue={requestedTeam} data-auto-submit="true">
                    <option value="">All teams</option>
                    {metadata.available_teams.map((team) => (
                      <option key={team.value} value={team.value}>
                        {team.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  <LoadingLink
                    href={swapHref}
                    className="button-secondary w-full px-4 py-3 text-sm"
                    loadingMessage="Swapping catchers..."
                    loadingSubtitle="Reversing catcher A and catcher B."
                  >
                    Swap catchers
                  </LoadingLink>
                </div>
                <div className="flex items-end">
                  {compareLeaderHref ? (
                    <LoadingLink
                      href={compareLeaderHref}
                      className="button-secondary w-full px-4 py-3 text-sm"
                      loadingMessage="Loading leaderboard leader..."
                      loadingSubtitle={`Comparing against ${leaderboardLeader?.catcher_name}.`}
                    >
                      Compare to leader
                    </LoadingLink>
                  ) : (
                    <div className="meta-pill flex h-[3.15rem] items-center rounded-[0.95rem] px-4 text-xs font-semibold uppercase tracking-[0.18em]">
                      URL-backed compare state
                    </div>
                  )}
                </div>
              </div>
            </LoadingForm>

            {sameCatcherRequested ? (
              <div className="warning-panel rounded-[1.25rem] px-4 py-3 text-sm leading-7 text-muted">
                The same catcher was requested twice, so compare mode automatically switched to the next
                available distinct catcher.
              </div>
            ) : null}
            {belowFloor.length > 0 ? (
              <div className="warning-panel rounded-[1.25rem] px-4 py-3 text-sm leading-7 text-muted">
                {belowFloor.map((detail) => detail.identity.catcher_name).join(" and ")} are below the current
                {` ${minPitches.toLocaleString()}-pitch`} display floor. Their comparison stays visible, but split
                tables should be treated as low-sample.
              </div>
            ) : null}
          </div>

          <aside className="panel-dark overflow-hidden rounded-[1.55rem] p-5 text-white sm:p-6">
            <div className="grid gap-4 lg:grid-cols-2">
              {[catcherA, catcherB].map((detail, index) => (
                <div key={detail.identity.catcher_id} className="scorebug rounded-[1.25rem] border border-white/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {detail.identity.headshot_url ? (
                        <Image
                          src={detail.identity.headshot_url}
                          alt={detail.identity.catcher_name}
                          width={72}
                          height={72}
                          className="h-16 w-16 rounded-[1rem] border border-white/12 object-cover"
                        />
                      ) : (
                        <div className="dark-pill flex h-16 w-16 items-center justify-center rounded-[1rem] text-2xl font-semibold">
                          {detail.identity.catcher_name[0]}
                        </div>
                      )}
                      <div>
                        <div className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-white/56">
                          Catcher {index === 0 ? "A" : "B"}
                        </div>
                        <div className="mt-2 text-xl font-semibold">{detail.identity.catcher_name}</div>
                        <div className="mt-2 text-sm text-white/72">
                          {detail.identity.team ?? "FA"} | {detail.identity.bats ?? "?"}/{detail.identity.throws ?? "?"}
                        </div>
                      </div>
                    </div>
                    <SampleStabilityBadge
                      label={detail.diagnostics.stability_label}
                      qualified={detail.diagnostics.qualified_for_grades}
                      compact
                    />
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <div>
                      <div className="text-[0.58rem] uppercase tracking-[0.18em] text-white/56">Pitches</div>
                      <div className="numeric mt-1 text-lg font-semibold">{detail.total_pitches.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-[0.58rem] uppercase tracking-[0.18em] text-white/56">Games</div>
                      <div className="numeric mt-1 text-lg font-semibold">{detail.diagnostics.games_scored ?? 0}</div>
                    </div>
                    <div>
                      <div className="text-[0.58rem] uppercase tracking-[0.18em] text-white/56">Total DVA</div>
                      <div className="numeric mt-1 text-lg font-semibold">{formatSigned(detail.total_dva, 3)}</div>
                    </div>
                    <div>
                      <div className="text-[0.58rem] uppercase tracking-[0.18em] text-white/56">Avg DVA</div>
                      <div className="numeric mt-1 text-lg font-semibold">{formatSigned(detail.avg_dva, 5)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="scouting-seam mt-5" />

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="scorebug rounded-[1rem] border border-white/10 px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-white/56">DVA delta</div>
                <div className="numeric mt-2 text-[1.45rem] font-semibold">
                  {formatSigned(catcherA.total_dva - catcherB.total_dva, 3)}
                </div>
                <div className="mt-2 text-sm text-white/72">Positive favors catcher A.</div>
              </div>
              <div className="scorebug rounded-[1rem] border border-white/10 px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-white/56">Population</div>
                <div className="numeric mt-2 text-[1.45rem] font-semibold">{comparison.population_size}</div>
                <div className="mt-2 text-sm text-white/72">
                  {comparison.qualified_population_size} qualified for grade normalization.
                </div>
              </div>
              <div className="scorebug rounded-[1rem] border border-white/10 px-4 py-3">
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-white/56">Context</div>
                <div className="mt-2 text-lg font-semibold">{requestedTeam || "All teams"}</div>
                <div className="mt-2 text-sm text-white/72">
                  {dateFrom || dateTo ? `${dateFrom || "start"} to ${dateTo || "today"}` : "Full season window"}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <SectionCard
        eyebrow="Freshness"
        title="What context you are comparing"
        subtitle="Compare mode keeps the public-data freshness and season context visible so a shared URL never hides stale or sparse inputs."
      >
        <DataFreshnessPanel metadata={metadata} />
      </SectionCard>

      <SectionCard
        eyebrow="Topline"
        title="Summary metrics under one shared context"
        subtitle="These are real catcher-specific values computed under the same season, team, and date window."
      >
        <ComparisonTable catcherALabel={aLabel} catcherBLabel={bLabel} rows={summaryRows} />
      </SectionCard>

      <SectionCard
        eyebrow="Grades"
        title="20-80 game-calling grade sheet"
        subtitle="Grade normalization uses the filtered catcher population for the selected comparison context. Public receiving metrics remain season-level support inputs."
      >
        <ComparisonTable catcherALabel={aLabel} catcherBLabel={bLabel} rows={gradeRows} />
      </SectionCard>

      <SectionCard
        eyebrow="Count Logic"
        title="Exact count-state and count-bucket comparison"
        subtitle="Use the matrix to toggle catcher A, catcher B, and delta. Then use the bucket table and strongest-count cards to understand where the edge lives."
      >
        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="surface-panel rounded-[1.45rem] p-5">
            <CompareCountStatePanel
              catcherALabel={aLabel}
              catcherBLabel={bLabel}
              catcherARows={countStateRowsA}
              catcherBRows={countStateRowsB}
            />
          </div>
          <div className="space-y-5">
            <div className="surface-panel rounded-[1.45rem] p-5">
              <div className="label-kicker">Count bucket delta</div>
              <div className="mt-4">
                <ComparisonTable catcherALabel={aLabel} catcherBLabel={bLabel} rows={countBucketRows} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="surface-panel rounded-[1.35rem] p-4">
                <div className="label-kicker">{catcherA.identity.catcher_name}</div>
                <div className="mt-4 text-sm leading-7 text-muted">
                  Strongest count:{" "}
                  <span className="font-semibold text-ink">
                    {strongestA?.split_value ?? "--"} ({formatSigned(strongestA?.avg_dva, 4)})
                  </span>
                </div>
                <div className="mt-2 text-sm leading-7 text-muted">
                  Weakest count:{" "}
                  <span className="font-semibold text-ink">
                    {weakestA?.split_value ?? "--"} ({formatSigned(weakestA?.avg_dva, 4)})
                  </span>
                </div>
              </div>
              <div className="surface-panel rounded-[1.35rem] p-4">
                <div className="label-kicker">{catcherB.identity.catcher_name}</div>
                <div className="mt-4 text-sm leading-7 text-muted">
                  Strongest count:{" "}
                  <span className="font-semibold text-ink">
                    {strongestB?.split_value ?? "--"} ({formatSigned(strongestB?.avg_dva, 4)})
                  </span>
                </div>
                <div className="mt-2 text-sm leading-7 text-muted">
                  Weakest count:{" "}
                  <span className="font-semibold text-ink">
                    {weakestB?.split_value ?? "--"} ({formatSigned(weakestB?.avg_dva, 4)})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Pitch Mix"
        title="Pitch-type behavior and delta view"
        subtitle="The charts show each catcher’s pitch-type profile, while the table highlights where pitch-type value or usage diverges."
      >
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="surface-panel rounded-[1.45rem] p-5">
            <PitchTypeDvaChart rows={pitchTypeRowsA} title={`${catcherA.identity.catcher_name} pitch-type DVA`} />
          </div>
          <div className="surface-panel rounded-[1.45rem] p-5">
            <PitchTypeDvaChart rows={pitchTypeRowsB} title={`${catcherB.identity.catcher_name} pitch-type DVA`} />
          </div>
        </div>
        <div className="mt-6 surface-panel rounded-[1.45rem] p-5">
          <div className="label-kicker">Pitch-type delta table</div>
          <div className="mt-4">
            <ComparisonTable catcherALabel={aLabel} catcherBLabel={bLabel} rows={pitchTypeCompareRows} />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Pairings"
        title="Pitcher-catcher pairing comparison"
        subtitle="This is the battery-fit section: top partners, top pairing value, and how much paired volume supports the read."
      >
        <div className="grid gap-6 xl:grid-cols-2">
          {[catcherA, catcherB].map((detail) => (
            <div key={detail.identity.catcher_id} className="surface-panel rounded-[1.45rem] p-5">
              <PairingDvaChart rows={pitcherTopline(detail)} title={`${detail.identity.catcher_name} top pairings`} />
              <div className="mt-5 space-y-3">
                {pitcherTopline(detail).map((row) => (
                  <div
                    key={`${detail.identity.catcher_id}-${row.pitcher_id}`}
                    className="rounded-[1.1rem] border border-line/60 bg-surface-elevated/72 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-ink">{row.pitcher_name}</div>
                        <div className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">
                          {row.pitches.toLocaleString()} pitches
                        </div>
                      </div>
                      <div className="numeric text-right text-lg font-semibold text-ink">
                        {formatSigned(row.total_dva, 3)}
                      </div>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-muted">
                      Avg DVA {formatSigned(row.avg_dva, 4)} | Outperform {formatPct(row.outperform_rate)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        eyebrow="Support + Trust"
        title="Public metrics and diagnostics"
        subtitle="Public receiving metrics remain support context. Diagnostics tell you how comfortable to be with the model output under the selected sample."
        tone="quiet"
      >
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="surface-panel rounded-[1.45rem] p-5">
            <div className="label-kicker">Public catcher support metrics</div>
            <div className="mt-4">
              <ComparisonTable catcherALabel={aLabel} catcherBLabel={bLabel} rows={publicMetricRows} />
            </div>
          </div>
          <div className="surface-panel rounded-[1.45rem] p-5">
            <div className="label-kicker">Diagnostics and sample quality</div>
            <div className="mt-4">
              <ComparisonTable catcherALabel={aLabel} catcherBLabel={bLabel} rows={diagnosticRows} />
            </div>
          </div>
        </div>
      </SectionCard>

      <ApiDebugPanel transport={apiTransport} items={debugItems} />
    </div>
  );
}
