import type { PairingSummary } from "@catcher-intel/contracts";

type PairingIntelTableProps = {
  rows: PairingSummary[];
};

function signed(value: number | null | undefined, digits = 3) {
  if (value == null) {
    return "--";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function PairingIntelTable({ rows }: PairingIntelTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[1.45rem] border border-dashed border-line/70 bg-surface/70 p-5 text-sm leading-7 text-muted">
        No pitcher-catcher pairing rows are available for this catcher-season yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div
          key={row.pitcher_id}
          className="surface-panel grid min-h-[7.9rem] gap-3 rounded-[1.15rem] p-4 md:grid-cols-[3rem_1.4fr_.8fr_.8fr_.8fr]"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-[1rem] bg-surface-strong text-sm font-semibold text-white">
            {index + 1}
          </div>
          <div>
            <div className="font-semibold text-ink">{row.pitcher_name}</div>
            <div className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">
              {row.pitches.toLocaleString()} paired pitches
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted">Total DVA</div>
            <div className="numeric mt-2 text-lg font-semibold text-ink">
              {signed(row.total_dva, 3)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted">Avg DVA</div>
            <div className="numeric mt-2 text-lg font-semibold text-ink">
              {signed(row.avg_dva, 4)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted">Execution</div>
            <div className="numeric mt-2 text-lg font-semibold text-ink">
              {signed(row.avg_execution_gap, 4)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
