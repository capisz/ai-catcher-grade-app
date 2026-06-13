type ZoneCell = {
  zone: number;
  pitches: number;
  pitch_share: number | null;
  avg_batter_hotness: number | null;
  avg_batter_value: number | null;
};

type LiveZoneGridProps = {
  zones: ZoneCell[];
};

function cellBackground(cell: ZoneCell) {
  if (cell.pitches === 0 || cell.avg_batter_hotness == null) {
    return "rgba(255, 255, 255, 0.04)";
  }
  const hotness = cell.avg_batter_hotness;
  // Batters hot there -> red; cold -> blue. Intensity scales with distance
  // from neutral so the grid reads like a broadcast hot-zone graphic.
  if (hotness >= 0.5) {
    const alpha = 0.25 + (hotness - 0.5) * 1.3;
    return `rgba(240, 71, 62, ${Math.min(alpha, 0.9).toFixed(2)})`;
  }
  const alpha = 0.25 + (0.5 - hotness) * 1.3;
  return `rgba(37, 99, 235, ${Math.min(alpha, 0.9).toFixed(2)})`;
}

function formatAvg(value: number | null) {
  if (value == null) {
    return "--";
  }
  return value.toFixed(3).replace(/^0/, "");
}

/**
 * ESPN-style 3x3 strike-zone heat grid from the catcher's view. Cell color =
 * how hot the batters faced are in that zone; big number = their zone batting
 * average; small line = the share of called pitches located there.
 */
export function LiveZoneGrid({ zones }: LiveZoneGridProps) {
  const byZone = new Map(zones.map((cell) => [cell.zone, cell]));
  const rows: number[][] = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
  ];

  return (
    <div>
      <div className="mx-auto w-fit rounded-lg border-2 border-dashed border-white/40 p-2">
        <div className="grid grid-cols-3 gap-1">
          {rows.flat().map((zoneNumber) => {
            const cell = byZone.get(zoneNumber);
            if (!cell) {
              return <div key={zoneNumber} className="h-20 w-20 sm:h-24 sm:w-24" />;
            }
            return (
              <div
                key={zoneNumber}
                className="flex h-20 w-20 flex-col items-center justify-center rounded-sm sm:h-24 sm:w-24"
                style={{ background: cellBackground(cell) }}
                title={`Zone ${cell.zone}: ${cell.pitches} pitches`}
              >
                <div className="numeric font-serif text-lg font-bold leading-none text-white sm:text-xl">
                  {formatAvg(cell.avg_batter_value)}
                </div>
                <div className="mt-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-white/70">
                  {cell.pitch_share != null ? `${(cell.pitch_share * 100).toFixed(0)}% calls` : "no calls"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-4 text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-white/55">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[rgba(240,71,62,0.8)]" /> Batter hot zone
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[rgba(37,99,235,0.8)]" /> Batter cold zone
        </span>
        <span>Catcher&apos;s view</span>
      </div>
    </div>
  );
}
