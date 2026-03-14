"use client";

import type { TrendPoint } from "@catcher-intel/contracts";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartShell } from "@/components/chart-shell";

export function TrendChart({ points }: { points: TrendPoint[] }) {
  return (
    <ChartShell heightClass="h-[20rem]" title="Trend chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ left: -18, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid stroke="rgba(18,33,29,0.08)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#5d6d66", fontSize: 12 }} />
          <YAxis tick={{ fill: "#5d6d66", fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              borderRadius: "18px",
              border: "1px solid rgba(18,33,29,0.12)",
              background: "rgba(255,249,236,0.96)",
            }}
          />
          <Line
            dataKey="dva_total"
            stroke="#c5512f"
            strokeWidth={3}
            dot={{ r: 4, fill: "#12332e" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
