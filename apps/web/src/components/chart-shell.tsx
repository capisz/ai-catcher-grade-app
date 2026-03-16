"use client";

import { useSyncExternalStore } from "react";

type ChartShellProps = {
  heightClass: string;
  title: string;
  children: React.ReactNode;
};

export function ChartShell({ heightClass, title, children }: ChartShellProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  return (
    <div className="w-full">
      <div className="mb-3 text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted">
        {title}
      </div>
      <div className={heightClass}>
        {mounted ? (
          children
        ) : (
          <div className="flex h-full w-full items-center justify-center rounded-[1.2rem] border border-dashed border-line/60 bg-surface/70">
            <div className="text-center">
              <div className="text-sm text-muted">Loading interactive chart…</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
