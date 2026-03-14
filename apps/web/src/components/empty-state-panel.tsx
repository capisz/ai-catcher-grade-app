type EmptyStatePanelProps = {
  eyebrow: string;
  title: string;
  description: string;
  detail?: string;
  action?: React.ReactNode;
  tone?: "default" | "caution";
};

export function EmptyStatePanel({
  eyebrow,
  title,
  description,
  detail,
  action,
  tone = "default",
}: EmptyStatePanelProps) {
  return (
    <section
      className={[
        "rounded-[1.8rem] border p-6 sm:p-7",
        tone === "caution"
          ? "border-amber-300/70 bg-[linear-gradient(180deg,rgba(255,248,236,0.96),rgba(252,241,223,0.92))] shadow-[0_20px_50px_rgba(156,100,52,0.08)]"
          : "card",
      ].join(" ")}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div
            className={[
              "text-xs font-semibold uppercase tracking-[0.22em]",
              tone === "caution" ? "text-amber-800" : "text-accent-clay",
            ].join(" ")}
          >
            {eyebrow}
          </div>
          <h1 className="mt-3 font-serif text-4xl text-ink">{title}</h1>
          <p className="mt-4 text-sm leading-7 text-muted">{description}</p>
          {detail ? <p className="mt-2 text-sm leading-7 text-muted">{detail}</p> : null}
        </div>
        <div className="flex h-24 w-24 items-center justify-center rounded-[1.25rem] border border-line/70 bg-white/50">
          <div className="relative h-10 w-10 rotate-45 rounded-[0.8rem] border border-surface-strong/28">
            <div className="absolute inset-[0.35rem] rounded-[0.45rem] border border-accent/45" />
          </div>
        </div>
      </div>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
