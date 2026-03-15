import type { ApiTransportInfo } from "@/lib/api";

type DebugItem = {
  label: string;
  status: "ok" | "error" | "warning";
  detail: string;
};

type ApiDebugPanelProps = {
  transport: ApiTransportInfo;
  items: DebugItem[];
  defaultOpen?: boolean;
};

function tone(status: DebugItem["status"]) {
  if (status === "ok") {
    return "border-brand-primary/20 bg-brand-primary/8 text-brand-primary";
  }
  if (status === "warning") {
    return "border-warning/18 bg-warning-soft text-warning";
  }
  return "border-danger/18 bg-danger-soft text-danger";
}

export function ApiDebugPanel({
  transport,
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
            Live proxy checks for this page render
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="meta-pill rounded-full px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em]">
            {transport.usingDefault ? "Default backend target" : "Configured backend target"}
          </div>
          <div className="meta-pill rounded-full px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em]">
            Live route checks
          </div>
        </div>
      </summary>
      <div className="border-t border-line/60 px-4 pb-4 pt-3">
        <div className="mb-3 grid gap-3 lg:grid-cols-3">
          <div className="surface-panel rounded-[1rem] p-3">
            <div className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-muted">
              Proxy route
            </div>
            <div className="mt-2 break-all text-sm leading-6 text-ink">{transport.proxyBaseUrl}</div>
          </div>
          <div className="surface-panel rounded-[1rem] p-3">
            <div className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-muted">
              Backend target
            </div>
            <div className="mt-2 break-all text-sm leading-6 text-ink">{transport.backendBaseUrl}</div>
          </div>
          <div
            className={[
              "rounded-[1rem] border p-3",
              transport.usingDefault ? "warning-panel" : "surface-panel",
            ].join(" ")}
          >
            <div className="text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-muted">
              Config source
            </div>
            <div className="mt-2 text-sm leading-6 text-ink">{transport.configuredFrom}</div>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.label}
              className="surface-panel rounded-[1rem] p-3"
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
