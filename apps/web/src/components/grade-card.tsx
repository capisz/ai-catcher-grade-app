import type { GradeValue } from "@catcher-intel/contracts";

type GradeCardProps = {
  label: string;
  grade: GradeValue;
  description?: string;
};

function tone(score: number | null | undefined) {
  if (score == null) {
    return "surface-panel border-line";
  }
  if (score >= 65) {
    return "border-brand-secondary/20 bg-[linear-gradient(180deg,rgba(200,148,106,0.16),rgba(255,251,246,0.94))]";
  }
  if (score >= 55) {
    return "border-surface-strong/16 bg-[linear-gradient(180deg,rgba(68,83,95,0.1),rgba(255,251,246,0.94))]";
  }
  return "border-accent-clay/18 bg-[linear-gradient(180deg,rgba(162,95,73,0.12),rgba(255,251,246,0.94))]";
}

export function GradeCard({ label, grade, description }: GradeCardProps) {
  return (
    <div
      className={[
        "min-h-[14.5rem] rounded-[1.2rem] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]",
        tone(grade.score),
      ].join(" ")}
    >
      <div className="text-[0.66rem] font-semibold uppercase tracking-[0.22em] text-muted">
        {label}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="numeric text-[2.35rem] font-semibold leading-none text-ink">
          {grade.score?.toFixed(1) ?? "--"}
        </div>
        <div className="meta-pill rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-accent-clay">
          {grade.label ?? "Unscored"}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] uppercase tracking-[0.18em] text-muted">
        <span>{grade.qualified ? "Qualified" : "Limited sample"}</span>
        {grade.population_size ? <span>{grade.population_size} catchers</span> : null}
      </div>
      {description ? <p className="mt-3 text-sm leading-6 text-muted">{description}</p> : null}
      {grade.stability_note ? (
        <p className="mt-3 text-xs leading-6 text-muted">{grade.stability_note}</p>
      ) : null}
    </div>
  );
}
