"use client";

import type { LeaderboardEntry } from "@catcher-intel/contracts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartShell } from "@/components/chart-shell";

export function LeaderboardChart({ entries }: { entries: LeaderboardEntry[] }) {
  const data = [...entries]
    .slice(0, 8)
    .map((entry, index) => ({
      ...entry,
      label: entry.catcher_name.split(" ").slice(-1)[0] ?? String(entry.catcher_id),
      rank: index + 1,
    }))
    .reverse();

  return (
    <ChartShell heightClass="h-[24rem]" title="Leaderboard chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 18, right: 18, top: 10, bottom: 10 }}>
          <CartesianGrid stroke="var(--chart-grid)" horizontal={true} vertical={false} />
          <XAxis
            type="number"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickFormatter={(value: number) => value.toFixed(1)}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={72}
            tick={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600 }}
          />
          <ReferenceLine x={0} stroke="var(--chart-reference)" />
          <Tooltip
            cursor={{ fill: "rgba(68,83,95,0.05)" }}
            formatter={(value: number, name: string) => [
              name === "total_dva" ? value.toFixed(3) : value.toString(),
              name === "total_dva" ? "Total DVA" : name,
            ]}
            contentStyle={{
              borderRadius: "18px",
              border: "1px solid var(--line)",
              background: "var(--chart-tooltip-bg)",
              boxShadow: "0 18px 40px rgba(68,83,95,0.12)",
            }}
          />
          <Bar dataKey="total_dva" radius={[0, 12, 12, 0]} barSize={22}>
            {data.map((entry) => (
              <Cell
                key={entry.catcher_id}
                fill={entry.total_dva >= 0 ? "var(--chart-primary)" : "var(--chart-accent)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
