import type { CatcherSummaryInsight } from "@catcher-intel/contracts";

type CatcherSummaryInsightsProps = {
  insights: CatcherSummaryInsight[];
};

function toneClasses(tone: CatcherSummaryInsight["tone"]) {
  if (tone === "positive") {
    return "border-line border-l-4 border-l-positive bg-surface";
  }
  if (tone === "caution") {
    return "border-line border-l-4 border-l-negative bg-surface";
  }
  return "border-line border-l-4 border-l-ink bg-surface";
}

export function CatcherSummaryInsights({ insights }: CatcherSummaryInsightsProps) {
  if (insights.length === 0) {
    return (
      <div className="surface-panel rounded-xl p-5 text-sm leading-6 text-muted">
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
            "min-h-[12.5rem] rounded-xl border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.34)]",
            toneClasses(insight.tone),
          ].join(" ")}
        >
          <div className="text-[0.64rem] font-semibold uppercase tracking-[0.06em] text-muted">
            {insight.label}
          </div>
          <h3 className="mt-3 font-serif text-lg leading-tight text-ink">{insight.headline}</h3>
          <p className="mt-3 text-sm leading-6 text-muted">{insight.detail}</p>
        </article>
      ))}
    </div>
  );
}
