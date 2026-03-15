type MetricCardProps = {
  label: string;
  value: string;
  note?: string;
  invert?: boolean;
};

export function MetricCard({ label, value, note, invert = false }: MetricCardProps) {
  return (
    <div
      className={[
        "min-h-[9.1rem] rounded-[1.05rem] border p-4",
        invert
          ? "scorebug border-white/12 bg-white/8 text-white"
          : "surface-panel text-ink",
      ].join(" ")}
    >
      <div
        className={[
          "text-[0.66rem] font-semibold uppercase tracking-[0.22em]",
          invert ? "text-white/62" : "text-muted",
        ].join(" ")}
      >
        {label}
      </div>
      <div className="numeric mt-3 text-[1.85rem] font-semibold leading-none sm:text-[1.95rem]">
        {value}
      </div>
      {note ? (
        <div
          className={["mt-2 text-xs leading-6", invert ? "text-white/70" : "text-muted"].join(" ")}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
}
