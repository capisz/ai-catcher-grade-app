import type { AppMetadataResponse } from "@catcher-intel/contracts";

function formatDateTime(value?: string | null) {
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
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

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

const LABELS: Array<{
  key:
    | "updated_through"
    | "latest_ingested_game_date"
    | "latest_successful_scoring_timestamp"
    | "latest_summary_update_timestamp";
  label: string;
  format: (value?: string | null) => string;
}> = [
  {
    key: "updated_through",
    label: "Updated Through",
    format: formatDate,
  },
  {
    key: "latest_ingested_game_date",
    label: "Latest Ingested Game",
    format: formatDate,
  },
  {
    key: "latest_successful_scoring_timestamp",
    label: "Latest Successful Scoring",
    format: formatDateTime,
  },
  {
    key: "latest_summary_update_timestamp",
    label: "Latest Summary Refresh",
    format: formatDateTime,
  },
] as const;

export function DataFreshnessPanel({ metadata }: { metadata: AppMetadataResponse }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {LABELS.map((item) => (
        <div key={item.key} className="surface-panel rounded-[1.1rem] p-4">
          <div className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">
            {item.label}
          </div>
          <div className="mt-3 text-base font-semibold text-ink">
            {item.format(metadata[item.key])}
          </div>
        </div>
      ))}
    </div>
  );
}
