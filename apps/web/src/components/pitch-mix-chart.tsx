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
          <CartesianGrid stroke="rgba(18,33,29,0.08)" vertical={false} />
          <XAxis dataKey="pitch_type" tick={{ fill: "#5d6d66", fontSize: 12 }} />
          <YAxis tick={{ fill: "#5d6d66", fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              borderRadius: "18px",
              border: "1px solid rgba(18,33,29,0.12)",
              background: "rgba(255,249,236,0.96)",
            }}
          />
          <Bar dataKey="dva" fill="#c5512f" radius={[12, 12, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
