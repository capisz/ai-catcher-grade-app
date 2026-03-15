"use client";

import type { TrendPoint } from "@catcher-intel/contracts";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartShell } from "@/components/chart-shell";

export function TrendChart({ points }: { points: TrendPoint[] }) {
  return (
    <ChartShell heightClass="h-[20rem]" title="Trend chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ left: -18, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              borderRadius: "18px",
              border: "1px solid var(--line)",
              background: "var(--chart-tooltip-bg)",
            }}
          />
          <Line
            dataKey="dva_total"
            stroke="var(--chart-primary)"
            strokeWidth={3}
            dot={{ r: 4, fill: "var(--chart-secondary)" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
