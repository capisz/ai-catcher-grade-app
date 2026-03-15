import type { PitchTypeSummary } from "@catcher-intel/contracts";

function familyTone(family: string | null | undefined) {
  switch (family) {
    case "fastball":
      return {
        accent: "bg-brand-primary",
        chip: "bg-brand-primary/8 text-brand-primary border-brand-primary/16",
      };
    case "breaker":
      return {
        accent: "bg-brand-secondary",
        chip: "bg-brand-secondary/14 text-accent-clay border-brand-secondary/24",
      };
    case "offspeed":
      return {
        accent: "bg-accent",
        chip: "bg-accent/10 text-accent-clay border-accent/20",
      };
    default:
      return {
        accent: "bg-brand-sage",
        chip: "bg-brand-sage/20 text-muted-strong border-brand-sage/26",
      };
  }
}

export function PitchTypePerformanceBoard({ rows }: { rows: PitchTypeSummary[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[1.45rem] border border-dashed border-line/70 bg-surface/70 p-5 text-sm leading-7 text-muted">
        No real pitch-type summary rows are available for this catcher-season yet.
      </div>
    );
  }

  const totalPitches = rows.reduce((sum, row) => sum + row.pitches, 0);
  const maxPitches = Math.max(...rows.map((row) => row.pitches), 1);

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const share = totalPitches ? (row.pitches / totalPitches) * 100 : 0;
        const widthPct = (row.pitches / maxPitches) * 100;
        const tone = familyTone(row.pitch_family);
        return (
          <div
            key={row.pitch_type}
            className="surface-panel min-h-[9.6rem] rounded-[1.15rem] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="text-lg font-semibold text-ink">{row.pitch_type}</div>
                  <span
                    className={[
                      "rounded-full border px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-[0.18em]",
                      tone.chip,
                    ].join(" ")}
                  >
                    {row.pitch_family ?? "unknown"}
                  </span>
                </div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">
                  {row.pitches.toLocaleString()} pitches | {share.toFixed(1)}% usage
                </div>
              </div>
              <div className="text-right">
                <div className="numeric text-xl font-semibold text-ink">
                  {row.avg_dva >= 0 ? "+" : ""}
                  {row.avg_dva.toFixed(4)}
                </div>
                <div className="text-xs uppercase tracking-[0.18em] text-muted">Avg DVA</div>
              </div>
            </div>
            <div className="mt-4 h-3 rounded-full bg-surface-quiet">
              <div
                className={["h-3 rounded-full", tone.accent].join(" ")}
                style={{ width: `${Math.max(widthPct, 8)}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
              <span>Execution gap {row.avg_execution_gap == null ? "--" : row.avg_execution_gap.toFixed(4)}</span>
              <span>Outperform {row.outperform_rate == null ? "--" : `${(row.outperform_rate * 100).toFixed(1)}%`}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
