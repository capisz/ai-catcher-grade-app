type StrikeZoneCardProps = {
  available?: boolean;
};

export function StrikeZoneCard({ available = false }: StrikeZoneCardProps) {
  if (available) {
    return null;
  }

  return (
    <div className="rounded-[1.7rem] border border-line/70 bg-white/72 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.34)]">
      <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted">
        Strike Zone View
      </div>
      <h3 className="mt-3 font-serif text-3xl text-ink">Location view pending</h3>
      <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
        Zone heatmap support has not been exposed by the API yet. This panel is ready for a future
        catcher call-map or batter weakness endpoint without inventing fake location values today.
      </p>
      <div className="mt-6 flex items-center justify-center">
        <div className="relative aspect-[4/5] w-full max-w-[17rem] rounded-[1.6rem] border border-line/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.75),rgba(241,231,215,0.7))]">
          <div className="absolute left-1/2 top-1/2 h-[68%] w-[54%] -translate-x-1/2 -translate-y-1/2 rounded-[1.3rem] border-2 border-surface-strong/40 bg-surface-strong/4" />
          <div className="absolute left-1/2 top-1/2 grid h-[68%] w-[54%] -translate-x-1/2 -translate-y-1/2 grid-cols-3 grid-rows-3 gap-1.5">
            {Array.from({ length: 9 }, (_, index) => (
              <div
                key={index}
                className={[
                  "rounded-[0.75rem] border",
                  index === 4
                    ? "border-success/22 bg-success-soft"
                    : "border-line/70 bg-white/42",
                ].join(" ")}
              />
            ))}
          </div>
          <div className="absolute bottom-4 left-4 right-4 rounded-[1rem] border border-line/70 bg-white/82 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Endpoint not yet available
          </div>
        </div>
      </div>
    </div>
  );
}
