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
        "rounded-lg border p-4",
        invert
          ? "scorebug border-white/12 bg-white/8 text-white"
          : "surface-panel text-ink",
      ].join(" ")}
    >
      <div
        className={[
          "text-[0.68rem] font-medium uppercase tracking-[0.06em]",
          invert ? "text-white/60" : "text-muted",
        ].join(" ")}
      >
        {label}
      </div>
      <div className="numeric mt-2 font-serif text-2xl font-semibold leading-none">
        {value}
      </div>
      {note ? (
        <div
          className={["mt-2 text-xs leading-5", invert ? "text-white/64" : "text-muted"].join(" ")}
        >
          {note}
        </div>
      ) : null}
    </div>
  );
}
