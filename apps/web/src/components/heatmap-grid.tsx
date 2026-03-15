import type { HeatCell } from "@catcher-intel/contracts";

type HeatmapGridProps = {
  cells: HeatCell[];
  positiveLabel: string;
  negativeLabel: string;
  compact?: boolean;
};

function buildCellLookup(cells: HeatCell[]) {
  return new Map(cells.map((cell) => [cell.zone, cell]));
}

function cellColor(value: number, compact: boolean) {
  if (value >= 0.08) {
    return compact ? "bg-danger text-white" : "bg-danger text-white";
  }
  if (value >= 0.03) {
    return compact ? "bg-accent text-ink" : "bg-accent text-ink";
  }
  if (value <= -0.05) {
    return compact ? "bg-surface-strong text-white" : "bg-surface-strong text-white";
  }
  if (value <= -0.015) {
    return compact ? "bg-success text-white" : "bg-success text-white";
  }
  return "bg-surface-raised/72 text-ink";
}

export function HeatmapGrid({
  cells,
  positiveLabel,
  negativeLabel,
  compact = false,
}: HeatmapGridProps) {
  const lookup = buildCellLookup(cells);
  const zones = Array.from({ length: 5 }, (_, rowIndex) =>
    Array.from({ length: 5 }, (_, colIndex) => `r${rowIndex + 1}c${colIndex + 1}`),
  );

  return (
    <div>
      <div className={`grid grid-cols-5 gap-2 ${compact ? "max-w-[22rem]" : "max-w-[34rem]"}`}>
        {zones.flat().map((zone) => {
          const cell = lookup.get(zone) ?? { zone, value: 0, label: "0.000" };

          return (
            <div
              key={zone}
              className={`flex aspect-square flex-col justify-between rounded-2xl border border-line/60 p-3 ${cellColor(cell.value, compact)}`}
            >
              <span className="text-[0.65rem] uppercase tracking-[0.18em] opacity-70">{zone}</span>
              <span className={compact ? "text-sm font-semibold" : "text-base font-semibold"}>
                {cell.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted">
        <span>{negativeLabel}</span>
        <div className="h-2 w-24 rounded-full bg-gradient-to-r from-surface-strong via-surface-raised to-danger" />
        <span>{positiveLabel}</span>
      </div>
    </div>
  );
}
