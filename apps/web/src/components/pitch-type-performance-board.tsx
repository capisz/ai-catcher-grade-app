import type { PitchTypeSummary } from "@catcher-intel/contracts";

function familyTone(family: string | null | undefined) {
  switch (family) {
    case "fastball":
      return {
        accent: "bg-surface-strong",
        chip: "bg-surface-strong/8 text-surface-strong border-surface-strong/14",
      };
    case "breaker":
      return {
        accent: "bg-[#2b6d7b]",
        chip: "bg-[#2b6d7b]/10 text-[#1f5965] border-[#2b6d7b]/18",
      };
    case "offspeed":
      return {
        accent: "bg-accent",
        chip: "bg-accent/10 text-accent-clay border-accent/18",
      };
    default:
      return {
        accent: "bg-muted",
        chip: "bg-white/70 text-muted border-line/70",
      };
  }
}

export function PitchTypePerformanceBoard({ rows }: { rows: PitchTypeSummary[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[1.45rem] border border-dashed border-line/70 bg-white/50 p-5 text-sm leading-7 text-muted">
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
            className="min-h-[9.6rem] rounded-[1.15rem] border border-line/70 bg-white/72 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
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
