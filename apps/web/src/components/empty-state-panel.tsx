import { BaseballLogo } from "@/components/icons/baseball-logo";

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
        tone === "caution" ? "warning-panel" : "card",
      ].join(" ")}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div
            className={[
              "text-xs font-semibold uppercase tracking-[0.22em]",
              tone === "caution" ? "text-warning" : "text-accent-clay",
            ].join(" ")}
          >
            {eyebrow}
          </div>
          <h1 className="mt-3 font-serif text-4xl text-ink">{title}</h1>
          <p className="mt-4 text-sm leading-7 text-muted">{description}</p>
          {detail ? <p className="mt-2 text-sm leading-7 text-muted">{detail}</p> : null}
        </div>
        <div className="surface-panel-quiet flex h-24 w-24 items-center justify-center rounded-[1.25rem]">
          <BaseballLogo className="h-12 w-12" />
        </div>
      </div>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
