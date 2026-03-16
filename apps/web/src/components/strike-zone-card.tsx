import type { LocationSummaryResponse } from "@catcher-intel/contracts";

import { HeatmapGrid } from "@/components/heatmap-grid";

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

type StrikeZoneCardProps = {
  summary?: LocationSummaryResponse | null;
};

export function StrikeZoneCard({ summary }: StrikeZoneCardProps) {
  if (!summary?.available) {
    return (
      <div className="surface-panel rounded-[1.7rem] p-5">
        <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted">
          Strike Zone View
        </div>
        <h3 className="mt-3 font-serif text-3xl text-ink">Location summary unavailable</h3>
        <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
          {summary?.note ??
            "Zone heatmap support has not been populated for this catcher-season yet. The panel stays visible so missing location context is explicit."}
        </p>
        <div className="mt-5 meta-pill inline-flex rounded-full px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em]">
          Public-data location summary pending
        </div>
      </div>
    );
  }

  return (
    <div className="surface-panel rounded-[1.7rem] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted">
            Strike Zone View
          </div>
          <h3 className="mt-3 font-serif text-3xl text-ink">Public location summary</h3>
          <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
            {summary.note}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="meta-pill rounded-[1rem] px-4 py-3">
            <div className="text-[0.62rem] uppercase tracking-[0.18em] text-muted">Avg DVA</div>
            <div className="numeric mt-2 text-lg font-semibold text-ink">
              {formatSigned(summary.avg_dva)}
            </div>
          </div>
          <div className="meta-pill rounded-[1rem] px-4 py-3">
            <div className="text-[0.62rem] uppercase tracking-[0.18em] text-muted">Outperform</div>
            <div className="numeric mt-2 text-lg font-semibold text-ink">
              {formatPct(summary.outperform_rate)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <HeatmapGrid
          cells={summary.cells}
          positiveLabel="Higher DVA"
          negativeLabel="Lower DVA"
        />
      </div>
    </div>
  );
}
