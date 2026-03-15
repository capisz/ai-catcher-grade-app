"use client";

import { BaseballLogo } from "@/components/icons/baseball-logo";

type LoadingOverlayProps = {
  open: boolean;
  message?: string;
  subtitle?: string;
};

export function LoadingOverlay({
  open,
  message = "Loading catcher intelligence...",
  subtitle = "Preparing the live scouting view.",
}: LoadingOverlayProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="loading-overlay fixed inset-0 z-[120] flex items-center justify-center px-5 py-8"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="loading-overlay__backdrop absolute inset-0" />
      <div className="loading-overlay__panel card relative w-full max-w-md overflow-hidden rounded-[1.8rem] px-7 py-8 text-center shadow-[0_28px_80px_rgba(68,83,95,0.18)]">
        <div className="hero-wash pointer-events-none absolute inset-x-0 top-0 h-28 opacity-90" />
        <div className="relative flex flex-col items-center">
          <div className="loading-emblem relative flex h-28 w-28 items-center justify-center">
            <div className="brand-loader-ring absolute inset-0 rounded-full border-[3px] border-brand-secondary/22 border-t-brand-secondary border-r-accent/85" />
            <div className="brand-loader-core flex h-20 w-20 items-center justify-center rounded-[1.55rem] border border-line/70 bg-surface-elevated text-brand-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.46)]">
              <BaseballLogo className="brand-loader-mark h-12 w-12" />
            </div>
          </div>

          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-line/70 bg-surface-soft/92 px-3 py-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-muted">
            Live scouting workspace
          </div>
          <h2 className="mt-5 font-serif text-[2rem] leading-none text-ink">
            {message}
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-7 text-muted">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
