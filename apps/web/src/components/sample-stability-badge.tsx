type SampleStabilityBadgeProps = {
  label?: string | null;
  qualified?: boolean;
  compact?: boolean;
};

export function SampleStabilityBadge({
  label,
  qualified = false,
  compact = false,
}: SampleStabilityBadgeProps) {
  const value = label ?? "Low sample";
  const classes =
    value === "High stability"
      ? "border-emerald-900/12 bg-emerald-900 text-white"
      : value === "Stable"
        ? "border-surface-strong/12 bg-surface-strong text-white"
        : value === "Limited sample"
          ? "border-warning/18 bg-warning-soft text-warning"
          : "border-danger/18 bg-danger-soft text-danger";

  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border font-semibold uppercase tracking-[0.18em]",
        compact ? "px-3 py-1.5 text-[0.62rem]" : "px-3.5 py-2 text-[0.68rem]",
        classes,
      ].join(" ")}
    >
      <span className={["h-1.5 w-1.5 rounded-full", qualified ? "bg-current" : "bg-current/80"].join(" ")} />
      {value}
    </span>
  );
}
