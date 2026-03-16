import type { CatcherSummaryInsight } from "@catcher-intel/contracts";

type CatcherSummaryInsightsProps = {
  insights: CatcherSummaryInsight[];
};

function toneClasses(tone: CatcherSummaryInsight["tone"]) {
  if (tone === "positive") {
    return "border-brand-secondary/24 bg-[linear-gradient(180deg,rgba(200,148,106,0.12),rgba(255,251,246,0.92))]";
  }
  if (tone === "caution") {
    return "border-accent-clay/20 bg-[linear-gradient(180deg,rgba(162,95,73,0.1),rgba(255,251,246,0.92))]";
  }
  return "border-line/70 bg-[linear-gradient(180deg,rgba(68,83,95,0.05),rgba(255,251,246,0.94))]";
}

export function CatcherSummaryInsights({ insights }: CatcherSummaryInsightsProps) {
  if (insights.length === 0) {
    return (
      <div className="surface-panel rounded-[1.35rem] p-5 text-sm leading-7 text-muted">
        No deterministic catcher summary could be built from the current real data yet.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {insights.map((insight) => (
        <article
          key={insight.key}
          className={[
            "min-h-[12.5rem] rounded-[1.35rem] border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.34)]",
            toneClasses(insight.tone),
          ].join(" ")}
        >
          <div className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-muted">
            {insight.label}
          </div>
          <h3 className="mt-3 font-serif text-[1.55rem] leading-tight text-ink">{insight.headline}</h3>
          <p className="mt-3 text-sm leading-7 text-muted">{insight.detail}</p>
        </article>
      ))}
    </div>
  );
}
