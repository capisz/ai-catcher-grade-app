"use client";

import type { PairingSummary } from "@catcher-intel/contracts";
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

type PairingDvaChartProps = {
  rows: PairingSummary[];
  title?: string;
  heightClass?: string;
};

function shortPitcherName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

export function PairingDvaChart({
  rows,
  title = "Pairing value chart",
  heightClass = "h-[22rem]",
}: PairingDvaChartProps) {
  if (rows.length === 0) {
    return (
      <div className={`${heightClass} flex items-center justify-center rounded-[1.2rem] border border-dashed border-line/70 bg-surface/72 px-5 text-center text-sm leading-7 text-muted`}>
        No pairing rows are available for this catcher-season yet.
      </div>
    );
  }

  const data = rows.slice(0, 8).map((row) => ({
    ...row,
    label: shortPitcherName(row.pitcher_name),
  }));

  return (
    <ChartShell heightClass={heightClass} title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 16, right: 12, top: 10, bottom: 10 }}>
          <CartesianGrid stroke="var(--chart-grid)" horizontal={true} vertical={false} />
          <XAxis
            type="number"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickFormatter={(value: number) => value.toFixed(1)}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={82}
            tick={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600 }}
          />
          <ReferenceLine x={0} stroke="var(--chart-reference)" />
          <Tooltip
            formatter={(value: number, name: string) => [
              name === "total_dva" ? value.toFixed(3) : value.toFixed(5),
              name === "total_dva" ? "Total DVA" : "Avg DVA",
            ]}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as PairingSummary | undefined;
              return row ? `${row.pitcher_name} | ${row.pitches.toLocaleString()} pitches` : "Pairing";
            }}
            contentStyle={{
              borderRadius: "18px",
              border: "1px solid var(--line)",
              background: "var(--chart-tooltip-bg)",
              boxShadow: "0 18px 40px rgba(68,83,95,0.12)",
            }}
          />
          <Bar dataKey="total_dva" radius={[0, 12, 12, 0]} barSize={22}>
            {data.map((row) => (
              <Cell
                key={row.pitcher_id}
                fill={row.total_dva >= 0 ? "var(--chart-primary)" : "var(--chart-accent)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
