type DebugItem = {
  label: string;
  status: "ok" | "error" | "warning";
  detail: string;
};

type ApiDebugPanelProps = {
  apiBaseUrl: string;
  items: DebugItem[];
  defaultOpen?: boolean;
};

function tone(status: DebugItem["status"]) {
  if (status === "ok") {
    return "border-emerald-900/14 bg-emerald-900/6 text-emerald-900";
  }
  if (status === "warning") {
    return "border-warning/18 bg-warning-soft text-warning";
  }
  return "border-danger/18 bg-danger-soft text-danger";
}

export function ApiDebugPanel({
  apiBaseUrl,
  items,
  defaultOpen = false,
}: ApiDebugPanelProps) {
  return (
    <details
      className="rounded-[1.2rem] border border-line/60 bg-surface-raised/76 shadow-[inset_0_1px_0_rgba(255,255,255,0.34)]"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-muted">
            Dev Debug
          </div>
          <div className="mt-1 text-sm font-medium text-ink">
            Live API checks for this page render
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="max-w-full rounded-full border border-line/70 bg-white/80 px-3 py-1.5 text-[0.62rem] font-semibold text-muted sm:max-w-[34rem]">
            {apiBaseUrl}
          </div>
          <div className="rounded-full border border-line/70 bg-white/80 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted">
            Live route checks
          </div>
        </div>
      </summary>
      <div className="border-t border-line/60 px-4 pb-4 pt-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.label}
              className="rounded-[1rem] border border-line/60 bg-white/72 p-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className={[
                    "inline-flex rounded-full border px-2 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.16em]",
                    tone(item.status),
                  ].join(" ")}
                >
                  {item.status}
                </span>
                <span className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">
                  {item.label}
                </span>
              </div>
              <div className="mt-3 text-sm leading-6 text-ink">{item.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
