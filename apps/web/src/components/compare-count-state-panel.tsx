"use client";

import { useState } from "react";
import type { CountSummary } from "@catcher-intel/contracts";

const BALLS = [0, 1, 2, 3];
const STRIKES = [0, 1, 2];

type CompareCountStatePanelProps = {
  catcherALabel: string;
  catcherBLabel: string;
  catcherARows: CountSummary[];
  catcherBRows: CountSummary[];
};

function keyFor(balls: number, strikes: number) {
  return `${balls}-${strikes}`;
}

function toneFor(value: number, mode: "a" | "b" | "delta") {
  if (mode === "delta") {
    if (value >= 0.008) {
      return "bg-brand-primary text-white border-brand-primary/24";
    }
    if (value >= 0.002) {
      return "bg-brand-sage/35 text-ink border-brand-sage/40";
    }
    if (value <= -0.008) {
      return "bg-accent-clay text-white border-accent-clay/24";
    }
    if (value <= -0.002) {
      return "bg-brand-sand/28 text-accent-clay border-brand-sand/38";
    }
    return "bg-surface-raised/84 text-ink border-line/70";
  }

  if (value >= 0.008) {
    return "bg-brand-primary text-white border-brand-primary/24";
  }
  if (value >= 0.002) {
    return "bg-brand-sage/35 text-ink border-brand-sage/40";
  }
  if (value <= -0.008) {
    return "bg-accent-clay text-white border-accent-clay/24";
  }
  if (value <= -0.002) {
    return "bg-brand-sand/28 text-accent-clay border-brand-sand/38";
  }
  return "bg-surface-raised/84 text-ink border-line/70";
}

export function CompareCountStatePanel({
  catcherALabel,
  catcherBLabel,
  catcherARows,
  catcherBRows,
}: CompareCountStatePanelProps) {
  const [mode, setMode] = useState<"a" | "delta" | "b">("delta");
  const byCountA = new Map(catcherARows.map((row) => [row.split_value, row]));
  const byCountB = new Map(catcherBRows.map((row) => [row.split_value, row]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: "a" as const, label: catcherALabel },
          { key: "delta" as const, label: "Delta" },
          { key: "b" as const, label: catcherBLabel },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setMode(option.key)}
            className={[
              "rounded-full border px-4 py-2 text-[0.66rem] font-semibold uppercase tracking-[0.18em] transition",
              mode === option.key
                ? "border-accent/28 bg-surface-strong text-white shadow-[0_12px_20px_rgba(68,83,95,0.16)]"
                : "border-line/60 bg-surface-elevated/72 text-muted hover:border-accent/24 hover:text-ink",
            ].join(" ")}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[3.8rem_repeat(3,minmax(0,1fr))] gap-2">
        <div />
        {STRIKES.map((strike) => (
          <div
            key={strike}
            className="meta-pill rounded-[1rem] px-3 py-2 text-center text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted"
          >
            {strike} strike{strike === 1 ? "" : "s"}
          </div>
        ))}
        {BALLS.map((ball) => (
          <div key={ball} className="contents">
            <div className="meta-pill flex items-center justify-center rounded-[1rem] px-2 py-3 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted">
              {ball} ball{ball === 1 ? "" : "s"}
            </div>
            {STRIKES.map((strike) => {
              const countKey = keyFor(ball, strike);
              const rowA = byCountA.get(countKey);
              const rowB = byCountB.get(countKey);
              const currentRow = mode === "a" ? rowA : rowB;
              const value =
                mode === "delta"
                  ? rowA && rowB
                    ? rowA.avg_dva - rowB.avg_dva
                    : null
                  : currentRow?.avg_dva ?? null;

              if (value == null) {
                return (
                  <div
                    key={countKey}
                    className="rounded-[1rem] border border-dashed border-line/70 bg-surface/70 p-4 text-center text-xs text-muted"
                  >
                    {mode === "delta" ? "No shared data" : "No data"}
                  </div>
                );
              }

              return (
                <div
                  key={countKey}
                  className={[
                    "min-h-[10rem] rounded-[1rem] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]",
                    toneFor(value, mode),
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold">{countKey}</div>
                    <div className="text-[0.62rem] uppercase tracking-[0.18em] opacity-70">
                      {mode === "delta"
                        ? `${rowA?.pitches?.toLocaleString() ?? 0}/${rowB?.pitches?.toLocaleString() ?? 0}`
                        : currentRow?.pitches?.toLocaleString() ?? "0"}
                    </div>
                  </div>
                  <div className="numeric mt-4 text-xl font-semibold">
                    {value >= 0 ? "+" : ""}
                    {value.toFixed(4)}
                  </div>
                  <div className="mt-2 text-[0.68rem] uppercase tracking-[0.18em] opacity-70">
                    {mode === "delta"
                      ? `${catcherALabel} vs ${catcherBLabel}`
                      : currentRow?.recommended_pitch_family ?? "No signal"}
                  </div>
                  <div className="mt-3 text-xs leading-6 opacity-80">
                    {mode === "delta"
                      ? "Positive favors catcher A. Negative favors catcher B."
                      : `Outperform ${(((currentRow?.outperform_rate ?? 0) || 0) * 100).toFixed(1)}%`}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
        <span>{mode === "delta" ? `Positive = ${catcherALabel} edge` : "Clay = worse than baseline"}</span>
        <div className="h-2.5 w-28 rounded-full bg-gradient-to-r from-accent-clay via-brand-sand/40 to-brand-primary" />
        <span>{mode === "delta" ? `Negative = ${catcherBLabel} edge` : "Slate = better than baseline"}</span>
      </div>
    </div>
  );
}
