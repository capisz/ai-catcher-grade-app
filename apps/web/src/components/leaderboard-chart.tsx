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
          <CartesianGrid stroke="rgba(16,35,31,0.08)" horizontal={true} vertical={false} />
          <XAxis
            type="number"
            tick={{ fill: "#60716b", fontSize: 12 }}
            tickFormatter={(value: number) => value.toFixed(1)}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={72}
            tick={{ fill: "#10231f", fontSize: 12, fontWeight: 600 }}
          />
          <ReferenceLine x={0} stroke="rgba(16,35,31,0.2)" />
          <Tooltip
            cursor={{ fill: "rgba(16,35,31,0.05)" }}
            formatter={(value: number, name: string) => [
              name === "total_dva" ? value.toFixed(3) : value.toString(),
              name === "total_dva" ? "Total DVA" : name,
            ]}
            contentStyle={{
              borderRadius: "18px",
              border: "1px solid rgba(16,35,31,0.12)",
              background: "rgba(255,250,242,0.97)",
              boxShadow: "0 18px 40px rgba(8,33,29,0.12)",
            }}
          />
          <Bar dataKey="total_dva" radius={[0, 12, 12, 0]} barSize={22}>
            {data.map((entry) => (
              <Cell
                key={entry.catcher_id}
                fill={entry.total_dva >= 0 ? "#18453f" : "#b85f3b"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
