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
    return compact ? "bg-[#c5512f] text-white" : "bg-[#c5512f] text-white";
  }
  if (value >= 0.03) {
    return compact ? "bg-[#e3a271] text-ink" : "bg-[#e7b284] text-ink";
  }
  if (value <= -0.05) {
    return compact ? "bg-[#12332e] text-white" : "bg-[#18413a] text-white";
  }
  if (value <= -0.015) {
    return compact ? "bg-[#7aa190] text-white" : "bg-[#87aa9c] text-white";
  }
  return "bg-white/65 text-ink";
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
        <div className="h-2 w-24 rounded-full bg-gradient-to-r from-[#12332e] via-[#fff6e7] to-[#c5512f]" />
        <span>{positiveLabel}</span>
      </div>
    </div>
  );
}

