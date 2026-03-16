import type { AppMetadataResponse } from "@catcher-intel/contracts";

import { SampleStabilityBadge } from "@/components/sample-stability-badge";

function formatDate(value?: string | null) {
  if (!value) {
    return "Unavailable";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

type ProductStatusStripProps = {
  metadata: AppMetadataResponse;
  sampleLabel?: string | null;
  qualified?: boolean;
  compact?: boolean;
};

export function ProductStatusStrip({
  metadata,
  sampleLabel,
  qualified = false,
  compact = false,
}: ProductStatusStripProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={[
          "pill-sage rounded-full font-semibold uppercase tracking-[0.18em]",
          compact ? "px-3 py-1.5 text-[0.62rem]" : "px-3.5 py-2 text-[0.64rem]",
        ].join(" ")}
      >
        {metadata.season_type_label}
      </span>
      <span
        className={[
          "pill-sand rounded-full font-semibold uppercase tracking-[0.18em]",
          compact ? "px-3 py-1.5 text-[0.62rem]" : "px-3.5 py-2 text-[0.64rem]",
        ].join(" ")}
      >
        Updated through {formatDate(metadata.updated_through)}
      </span>
      <span
        className={[
          "pill-clay rounded-full font-semibold uppercase tracking-[0.18em]",
          compact ? "px-3 py-1.5 text-[0.62rem]" : "px-3.5 py-2 text-[0.64rem]",
        ].join(" ")}
      >
        Model {metadata.model_version ?? "unscored"}
      </span>
      {sampleLabel ? (
        <SampleStabilityBadge label={sampleLabel} qualified={qualified} compact={compact} />
      ) : null}
    </div>
  );
}
