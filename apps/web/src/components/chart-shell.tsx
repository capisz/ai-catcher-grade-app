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
    <div className={`${heightClass} w-full`}>
      {mounted ? (
        children
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-[1.2rem] border border-dashed border-line/60 bg-surface/70">
          <div className="text-center">
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted">
              {title}
            </div>
            <div className="mt-3 text-sm text-muted">Loading interactive chart…</div>
          </div>
        </div>
      )}
    </div>
  );
}
