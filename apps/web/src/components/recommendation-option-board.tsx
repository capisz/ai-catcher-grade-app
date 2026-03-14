import type { RecommendationOption } from "@catcher-intel/contracts";

function formatSigned(value: number | null | undefined, digits = 4) {
  if (value == null) {
    return "--";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function familyTone(family: string | null | undefined) {
  switch (family) {
    case "fastball":
      return "border-surface-strong/14 bg-surface-strong/8 text-surface-strong";
    case "breaker":
      return "border-[#2b6d7b]/18 bg-[#2b6d7b]/10 text-[#1f5965]";
    case "offspeed":
      return "border-accent/18 bg-accent/10 text-accent-clay";
    default:
      return "border-line/70 bg-white/70 text-muted";
  }
}

export function RecommendationOptionBoard({
  options,
}: {
  options: RecommendationOption[];
}) {
  if (options.length === 0) {
    return (
      <div className="rounded-[1.25rem] border border-dashed border-line/70 bg-white/52 p-5 text-sm leading-7 text-muted">
        No recommendation candidates survived for this context.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {options.map((option, index) => (
        <div
          key={`${option.pitch_type}-${option.zone_bucket_25}-${index}`}
          className="grid gap-4 rounded-[1.2rem] border border-line/60 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] lg:grid-cols-[4rem_1.25fr_0.95fr_0.95fr]"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-[0.9rem] bg-surface-strong text-sm font-semibold text-white">
            {index + 1}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-lg font-semibold text-ink">{option.pitch_type}</div>
              <span
                className={[
                  "rounded-full border px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.18em]",
                  familyTone(option.pitch_type_group),
                ].join(" ")}
              >
                {option.pitch_type_group ?? "unknown"}
              </span>
            </div>
            <div className="mt-2 text-sm leading-6 text-muted">
              {option.pitch_name ?? "Pitch name unavailable"}
            </div>
            <div className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">
              Usage share {(option.usage_share * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted">
              Expected RV
            </div>
            <div className="numeric mt-2 text-xl font-semibold text-ink">
              {formatSigned(option.expected_rv, 4)}
            </div>
            <div className="mt-2 text-xs leading-6 text-muted">
              More negative is better for the defense.
            </div>
          </div>
          <div>
            <div className="text-[0.64rem] font-semibold uppercase tracking-[0.2em] text-muted">
              Target
            </div>
            <div className="mt-2 text-sm leading-7 text-muted">
              Zone 25: <span className="font-semibold text-ink">{option.zone_bucket_25 ?? "--"}</span>
            </div>
            <div className="text-sm leading-7 text-muted">
              Zone 9: <span className="font-semibold text-ink">{option.zone_bucket_9 ?? "--"}</span>
            </div>
            <div className="text-sm leading-7 text-muted">
              Plate target:{" "}
              <span className="font-semibold text-ink">
                {option.target_plate_x == null || option.target_plate_z == null
                  ? "--"
                  : `${option.target_plate_x.toFixed(2)}, ${option.target_plate_z.toFixed(2)}`}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
