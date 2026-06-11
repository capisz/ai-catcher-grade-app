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
    return "border-[#a7f3d0] bg-[linear-gradient(180deg,#ecfdf5,#ffffff)]";
  }
  if (score >= 55) {
    return "border-[#bfdbfe] bg-[linear-gradient(180deg,#eff6ff,#ffffff)]";
  }
  return "border-line bg-[linear-gradient(180deg,#f8fafc,#ffffff)]";
}

function pillTone(score: number | null | undefined) {
  if (score == null) {
    return "meta-pill text-muted";
  }
  if (score >= 65) {
    return "border border-[#a7f3d0] bg-[#ecfdf5] text-[#047857]";
  }
  if (score >= 55) {
    return "border border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]";
  }
  return "meta-pill text-muted-strong";
}

export function GradeCard({ label, grade, description }: GradeCardProps) {
  return (
    <div
      className={[
        "rounded-xl border p-4",
        tone(grade.score),
      ].join(" ")}
    >
      <div className="text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-muted">
        {label}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="numeric text-2xl font-semibold leading-none text-ink">
          {grade.score?.toFixed(1) ?? "--"}
        </div>
        <div className={["rounded-full px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.06em]", pillTone(grade.score)].join(" ")}>
          {grade.label ?? "Unscored"}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] uppercase tracking-[0.06em] text-muted">
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
