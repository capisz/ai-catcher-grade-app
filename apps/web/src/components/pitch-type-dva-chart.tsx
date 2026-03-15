"use client";

import type { PitchTypeSummary } from "@catcher-intel/contracts";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartShell } from "@/components/chart-shell";

export function PitchTypeDvaChart({ rows }: { rows: PitchTypeSummary[] }) {
  const data = rows.map((row) => ({
    pitch_type: row.pitch_type,
    total_dva: Number(row.total_dva.toFixed(3)),
    avg_dva: row.avg_dva,
    pitches: row.pitches,
  }));

  return (
    <ChartShell heightClass="h-[20rem]" title="Pitch type chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -18, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="pitch_type" tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <Tooltip
            formatter={(value: number, name: string) => [
              name === "total_dva" ? value.toFixed(3) : value.toFixed(5),
              name === "total_dva" ? "Total DVA" : "Avg DVA",
            ]}
            contentStyle={{
              borderRadius: "18px",
              border: "1px solid var(--line)",
              background: "var(--chart-tooltip-bg)",
            }}
          />
          <Bar dataKey="total_dva" fill="var(--chart-accent)" radius={[12, 12, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
