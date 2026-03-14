import type { GradeValue } from "@catcher-intel/contracts";

type GradeCardProps = {
  label: string;
  grade: GradeValue;
  description?: string;
};

function tone(score: number | null | undefined) {
  if (score == null) {
    return "border-line bg-white/72";
  }
  if (score >= 65) {
    return "border-emerald-900/12 bg-[linear-gradient(180deg,rgba(47,107,88,0.12),rgba(255,255,255,0.9))]";
  }
  if (score >= 55) {
    return "border-surface-strong/12 bg-[linear-gradient(180deg,rgba(13,48,44,0.08),rgba(255,255,255,0.92))]";
  }
  return "border-accent/14 bg-[linear-gradient(180deg,rgba(184,95,59,0.08),rgba(255,255,255,0.92))]";
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
        <div className="rounded-full border border-line/70 bg-white/70 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-accent-clay">
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
