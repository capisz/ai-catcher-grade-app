type SectionCardProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "quiet";
  action?: React.ReactNode;
};

export function SectionCard({
  eyebrow,
  title,
  subtitle,
  children,
  className = "",
  tone = "default",
  action,
}: SectionCardProps) {
  return (
    <section
      className={[
        tone === "quiet" ? "card-quiet" : "card",
        "rounded-[1.5rem] p-5 sm:p-6",
        className,
      ].join(" ")}
    >
      <div className="flex flex-col gap-4 border-b border-line/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <div className="label-kicker">{eyebrow}</div>
          <h2 className="mt-3 font-serif text-[1.85rem] leading-none text-ink sm:text-[2.05rem]">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">{subtitle}</p>
          ) : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
