"use client";

import type { PitchTypeSummary } from "@catcher-intel/contracts";
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

type PitchTypeDvaChartProps = {
  rows: PitchTypeSummary[];
  title?: string;
  heightClass?: string;
};

export function PitchTypeDvaChart({
  rows,
  title = "Pitch-type value chart",
  heightClass = "h-[20rem]",
}: PitchTypeDvaChartProps) {
  if (rows.length === 0) {
    return (
      <div className={`${heightClass} flex items-center justify-center rounded-[1.2rem] border border-dashed border-line/70 bg-surface/72 px-5 text-center text-sm leading-7 text-muted`}>
        No real pitch-type rows are available for this catcher-season yet.
      </div>
    );
  }

  const data = rows.map((row) => ({
    pitch_type: row.pitch_type,
    total_dva: Number(row.total_dva.toFixed(3)),
    avg_dva: row.avg_dva,
    pitches: row.pitches,
    outperform_rate: row.outperform_rate,
  }));

  return (
    <ChartShell heightClass={heightClass} title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ left: -18, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="pitch_type" tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <ReferenceLine y={0} stroke="var(--chart-reference)" />
          <Tooltip
            formatter={(value: number, name: string) => [
              name === "total_dva"
                ? value.toFixed(3)
                : name === "avg_dva"
                  ? value.toFixed(5)
                  : `${(value * 100).toFixed(1)}%`,
              name === "total_dva"
                ? "Total DVA"
                : name === "avg_dva"
                  ? "Avg DVA"
                  : "Outperform rate",
            ]}
            contentStyle={{
              borderRadius: "18px",
              border: "1px solid var(--line)",
              background: "var(--chart-tooltip-bg)",
            }}
          />
          <Bar dataKey="total_dva" radius={[12, 12, 0, 0]}>
            {data.map((row) => (
              <Cell
                key={row.pitch_type}
                fill={row.total_dva >= 0 ? "var(--chart-primary)" : "var(--chart-accent)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
