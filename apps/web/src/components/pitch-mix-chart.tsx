"use client";

import type { PitchMixPoint } from "@catcher-intel/contracts";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartShell } from "@/components/chart-shell";

export function PitchMixChart({ points }: { points: PitchMixPoint[] }) {
  const data = points.map((point) => ({
    ...point,
    share_pct: point.share * 100,
  }));

  return (
    <ChartShell heightClass="h-[20rem]" title="Pitch mix chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -18, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="pitch_type" tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              borderRadius: "18px",
              border: "1px solid var(--line)",
              background: "var(--chart-tooltip-bg)",
            }}
          />
          <Bar dataKey="dva" fill="var(--chart-secondary)" radius={[12, 12, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
