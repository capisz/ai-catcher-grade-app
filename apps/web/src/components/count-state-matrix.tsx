import type { CountSummary } from "@catcher-intel/contracts";

const BALLS = [0, 1, 2, 3];
const STRIKES = [0, 1, 2];

function cellClasses(value: number) {
  if (value >= 0.008) {
    return "bg-success text-white border-success/20";
  }
  if (value >= 0.002) {
    return "bg-success-soft text-success border-success/18";
  }
  if (value <= -0.008) {
    return "bg-danger text-white border-danger/18";
  }
  if (value <= -0.002) {
    return "bg-danger-soft text-danger border-danger/18";
  }
  return "bg-white/72 text-ink border-line/70";
}

function keyFor(balls: number, strikes: number) {
  return `${balls}-${strikes}`;
}

export function CountStateMatrix({ rows }: { rows: CountSummary[] }) {
  const byCount = new Map(rows.map((row) => [row.split_value, row]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[3.8rem_repeat(3,minmax(0,1fr))] gap-2">
        <div />
        {STRIKES.map((strike) => (
          <div
            key={strike}
            className="rounded-[1rem] border border-line/70 bg-white/60 px-3 py-2 text-center text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted"
          >
            {strike} strike{strike === 1 ? "" : "s"}
          </div>
        ))}
        {BALLS.map((ball) => (
          <div key={ball} className="contents">
            <div className="flex items-center justify-center rounded-[1rem] border border-line/70 bg-white/60 px-2 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted">
              {ball} ball{ball === 1 ? "" : "s"}
            </div>
            {STRIKES.map((strike) => {
              const row = byCount.get(keyFor(ball, strike));
              if (!row) {
                return (
                  <div
                    key={`${ball}-${strike}`}
                    className="rounded-[1.2rem] border border-dashed border-line/70 bg-white/40 p-4 text-center text-xs text-muted"
                  >
                    No data
                  </div>
                );
              }

              return (
                <div
                  key={row.split_value}
                  className={[
                    "min-h-[8.6rem] rounded-[1rem] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]",
                    cellClasses(row.avg_dva),
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold">{row.split_value}</div>
                    <div className="text-[0.62rem] uppercase tracking-[0.18em] opacity-70">
                      {row.pitches.toLocaleString()}
                    </div>
                  </div>
                  <div className="numeric mt-4 text-xl font-semibold">
                    {row.avg_dva >= 0 ? "+" : ""}
                    {row.avg_dva.toFixed(4)}
                  </div>
                  <div className="mt-2 text-[0.68rem] uppercase tracking-[0.18em] opacity-70">
                    {row.recommended_pitch_family ?? "No signal"}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
        <span>Rust = worse than baseline</span>
        <div className="h-2.5 w-28 rounded-full bg-gradient-to-r from-danger via-white to-success" />
        <span>Green = better than baseline</span>
      </div>
    </div>
  );
}
