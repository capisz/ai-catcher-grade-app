"use client";

import type { RecommendationOption } from "@catcher-intel/contracts";
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

type RecommendationRvChartProps = {
  options: RecommendationOption[];
};

export function RecommendationRvChart({ options }: RecommendationRvChartProps) {
  if (options.length === 0) {
    return (
      <div className="flex h-[20rem] items-center justify-center rounded-[1.2rem] border border-dashed border-line/70 bg-surface/72 px-5 text-center text-sm leading-7 text-muted">
        No recommendation candidates survived for this context.
      </div>
    );
  }

  const data = options.map((option, index) => ({
    ...option,
    label: `${index + 1}. ${option.pitch_type}`,
    usage_pct: option.usage_share * 100,
  }));

  return (
    <ChartShell heightClass="h-[20rem]" title="Recommendation value chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 24, right: 12, top: 8, bottom: 8 }}>
          <CartesianGrid stroke="var(--chart-grid)" horizontal={true} vertical={false} />
          <XAxis
            type="number"
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickFormatter={(value: number) => value.toFixed(2)}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={90}
            tick={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600 }}
          />
          <ReferenceLine x={0} stroke="var(--chart-reference)" />
          <Tooltip
            formatter={(value: number, name: string) => [
              name === "expected_rv" ? value.toFixed(4) : `${value.toFixed(1)}%`,
              name === "expected_rv" ? "Expected RV" : "Usage share",
            ]}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as RecommendationOption | undefined;
              if (!row) {
                return "Option";
              }
              const target = row.zone_bucket_25 ?? row.zone_bucket_9 ?? "no target";
              return `${row.pitch_type} | target ${target}`;
            }}
            contentStyle={{
              borderRadius: "18px",
              border: "1px solid var(--line)",
              background: "var(--chart-tooltip-bg)",
              boxShadow: "0 18px 40px rgba(68,83,95,0.12)",
            }}
          />
          <Bar dataKey="expected_rv" radius={[0, 12, 12, 0]} barSize={22}>
            {data.map((row, index) => (
              <Cell
                key={`${row.pitch_type}-${index}`}
                fill={
                  index === 0
                    ? "var(--chart-primary)"
                    : row.expected_rv <= 0
                      ? "var(--chart-secondary)"
                      : "var(--chart-accent)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
