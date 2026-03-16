type ComparisonRow = {
  label: string;
  catcherA: string;
  catcherB: string;
  delta?: string;
  lead?: "a" | "b" | "tie";
  note?: string;
};

type ComparisonTableProps = {
  catcherALabel: string;
  catcherBLabel: string;
  rows: ComparisonRow[];
  deltaLabel?: string;
};

function leadTone(lead: ComparisonRow["lead"], side: "a" | "b") {
  if (lead === "tie" || !lead) {
    return "bg-surface-elevated/72 text-ink";
  }
  if (lead === side) {
    return "bg-brand-primary text-white";
  }
  return "bg-surface-quiet text-muted";
}

export function ComparisonTable({
  catcherALabel,
  catcherBLabel,
  rows,
  deltaLabel = "Delta",
}: ComparisonTableProps) {
  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[1.2fr_0.95fr_0.75fr_0.95fr] gap-3 px-3 pb-1 md:grid">
        <div className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted">Metric</div>
        <div className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted">
          {catcherALabel}
        </div>
        <div className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted">
          {deltaLabel}
        </div>
        <div className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted">
          {catcherBLabel}
        </div>
      </div>
      {rows.map((row) => (
        <div
          key={row.label}
          className="rounded-[1.2rem] border border-line/60 bg-surface-elevated/62 px-4 py-3"
        >
          <div className="space-y-3 md:hidden">
            <div className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted">
              {row.label}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className={["rounded-[0.95rem] px-3 py-2 text-sm font-semibold", leadTone(row.lead, "a")].join(" ")}>
                <div className="text-[0.58rem] uppercase tracking-[0.18em] opacity-70">{catcherALabel}</div>
                <div className="mt-1">{row.catcherA}</div>
              </div>
              <div className="rounded-[0.95rem] bg-surface-soft px-3 py-2 text-sm font-semibold text-ink">
                <div className="text-[0.58rem] uppercase tracking-[0.18em] text-muted">{deltaLabel}</div>
                <div className="mt-1">{row.delta ?? "--"}</div>
              </div>
              <div className={["rounded-[0.95rem] px-3 py-2 text-sm font-semibold", leadTone(row.lead, "b")].join(" ")}>
                <div className="text-[0.58rem] uppercase tracking-[0.18em] opacity-70">{catcherBLabel}</div>
                <div className="mt-1">{row.catcherB}</div>
              </div>
            </div>
          </div>

          <div className="hidden items-center gap-3 md:grid md:grid-cols-[1.2fr_0.95fr_0.75fr_0.95fr]">
            <div>
              <div className="text-sm font-semibold text-ink">{row.label}</div>
              {row.note ? <div className="mt-1 text-xs leading-6 text-muted">{row.note}</div> : null}
            </div>
            <div className={["rounded-[0.95rem] px-3 py-2 text-sm font-semibold", leadTone(row.lead, "a")].join(" ")}>
              {row.catcherA}
            </div>
            <div className="rounded-[0.95rem] bg-surface-soft px-3 py-2 text-sm font-semibold text-ink">
              {row.delta ?? "--"}
            </div>
            <div className={["rounded-[0.95rem] px-3 py-2 text-sm font-semibold", leadTone(row.lead, "b")].join(" ")}>
              {row.catcherB}
            </div>
          </div>

          {row.note ? (
            <div className="mt-2 text-xs leading-6 text-muted md:hidden">{row.note}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
