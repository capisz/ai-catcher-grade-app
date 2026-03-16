"use client";

import { useEffect, useState } from "react";
import type { CatcherReportOptionsResponse } from "@catcher-intel/contracts";

import { BaseballLogo } from "@/components/icons/baseball-logo";
import { ApiRequestError, downloadCatcherReport, getCatcherReportOptions } from "@/lib/api";
import { useGlobalLoading } from "@/components/ui/loading-provider";
import { ModalPortal } from "@/components/ui/modal-portal";

type ReportBuilderProps = {
  catcherId: number;
  catcherName: string;
  team?: string | null;
  season: number;
  disabled?: boolean;
};

function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown report generation error.";
}

function saveBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function ReportBuilder({
  catcherId,
  catcherName,
  team,
  season,
  disabled = false,
}: ReportBuilderProps) {
  const { startLoading, stopLoading } = useGlobalLoading();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<CatcherReportOptionsResponse | null>(null);
  const [selectedSeason, setSelectedSeason] = useState(season);
  const [selectedFormat, setSelectedFormat] = useState<"csv" | "json" | "pdf">("json");
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [minPitches, setMinPitches] = useState(20);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setLoadingOptions(true);
    setError(null);
    getCatcherReportOptions(catcherId, { season: selectedSeason })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setOptions(response);
        setSelectedSeason(response.selected_season);
        setMinPitches(response.default_min_pitches);
        setSelectedSections(
          response.sections.filter((section) => section.available && section.default_selected).map((section) => section.key),
        );
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }
        setError(errorMessage(fetchError));
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingOptions(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [catcherId, open, selectedSeason]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const multiSectionCsv = selectedFormat === "csv" && selectedSections.length > 1;

  const toggleSection = (key: string) => {
    setSelectedSections((current) =>
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key],
    );
  };

  const selectAll = () => {
    setSelectedSections(options?.sections.filter((section) => section.available).map((section) => section.key) ?? []);
  };

  const clearAll = () => {
    setSelectedSections([]);
  };

  const handleDownload = async () => {
    if (!options || selectedSections.length === 0) {
      setError("Select at least one report section before downloading.");
      return;
    }

    setSubmitting(true);
    setError(null);
    startLoading({
      message: "Generating scouting report...",
      subtitle: `Packaging ${catcherName} ${selectedSeason} report data for download.`,
    });

    try {
      const report = await downloadCatcherReport(catcherId, {
        season: selectedSeason,
        format: selectedFormat,
        includedSections: selectedSections,
        minPitches,
      });
      saveBlob(report.blob, report.filename);
      setOpen(false);
    } catch (downloadError) {
      setError(errorMessage(downloadError));
    } finally {
      setSubmitting(false);
      stopLoading();
    }
  };

  const activeSectionCount = selectedSections.length;

  return (
    <>
      <button
        type="button"
        className="button-secondary px-4 py-3 text-sm"
        disabled={disabled}
        onClick={() => {
          setSelectedSeason(season);
          setOpen(true);
        }}
      >
        Download report
      </button>

      {open ? (
        <ModalPortal>
          <div
            className="app-modal z-[110]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-builder-title"
          >
            <button
              type="button"
              aria-label="Close report builder"
              className="app-modal__backdrop"
              onClick={() => setOpen(false)}
            />
            <div className="app-modal__viewport">
              <div className="app-modal__panel card max-w-3xl rounded-[1.7rem]">
                <div className="hero-wash pointer-events-none absolute inset-x-0 top-0 h-24" />
                <div className="relative flex items-start justify-between gap-4 border-b border-line/60 px-6 py-5">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] border border-line/60 bg-surface-elevated text-brand-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.46)]">
                      <BaseballLogo className="h-9 w-9" />
                    </div>
                    <div>
                      <div className="label-kicker">Download Report</div>
                      <h2 id="report-builder-title" className="mt-2 font-serif text-[2rem] leading-none text-ink">
                        {catcherName}
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-muted">
                        Build a catcher report from real season data and choose exactly which sections to include.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
                        <span className="pill-sage rounded-full px-3 py-1.5">{team ?? "FA"}</span>
                        <span className="pill-sand rounded-full px-3 py-1.5">Season {selectedSeason}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button-secondary h-11 px-4 py-2 text-sm"
                    onClick={() => setOpen(false)}
                  >
                    Close
                  </button>
                </div>

                <div className="app-modal__body px-6 py-5">
                  {loadingOptions ? (
                    <div className="surface-panel rounded-[1.3rem] p-5 text-sm leading-7 text-muted">
                      Loading live report options for this catcher-season...
                    </div>
                  ) : error && !options ? (
                    <div className="warning-panel rounded-[1.3rem] p-5 text-sm leading-7 text-muted">
                      {error}
                    </div>
                  ) : options ? (
                    <div className="space-y-6">
                      <section className="grid gap-4 lg:grid-cols-[12rem_1fr]">
                        <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
                          Report setup
                        </div>
                        <div className="grid gap-4 rounded-[1.3rem] border border-line/60 bg-surface-elevated/72 p-4 md:grid-cols-2">
                          <label className="space-y-2">
                            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
                              Season
                            </span>
                            <select
                              className="field"
                              value={selectedSeason}
                              onChange={(event) => {
                                setOptions(null);
                                setSelectedSeason(Number(event.target.value));
                              }}
                            >
                              {options.available_seasons.map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="space-y-2">
                            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
                              Min row pitches
                            </span>
                            <input
                              className="field"
                              type="number"
                              min="1"
                              value={minPitches}
                              onChange={(event) =>
                                setMinPitches(Number(event.target.value) || options.default_min_pitches)
                              }
                            />
                          </label>
                        </div>
                      </section>

                      <section className="grid gap-4 lg:grid-cols-[12rem_1fr]">
                        <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
                          Format
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          {options.formats.map((format) => {
                            const active = selectedFormat === format.key;
                            return (
                              <button
                                key={format.key}
                                type="button"
                                disabled={!format.available}
                                onClick={() => setSelectedFormat(format.key as "csv" | "json" | "pdf")}
                                className={[
                                  "rounded-[1.2rem] border p-4 text-left transition",
                                  active
                                    ? "border-accent/28 bg-surface-strong text-white shadow-[0_16px_26px_rgba(68,83,95,0.18)]"
                                    : format.available
                                      ? "surface-panel hover:border-accent/24"
                                      : "border-line/40 bg-surface-soft/70 text-muted opacity-70",
                                ].join(" ")}
                              >
                                <div className="text-sm font-semibold">{format.label}</div>
                                <div className={`mt-2 text-sm leading-6 ${active ? "text-white/78" : "text-muted"}`}>
                                  {format.description}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </section>

                      <section className="grid gap-4 lg:grid-cols-[12rem_1fr]">
                        <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
                          Sections
                        </div>
                        <div className="space-y-4">
                          <div className="flex flex-wrap gap-3">
                            <button type="button" className="button-secondary px-4 py-2 text-sm" onClick={selectAll}>
                              Select all
                            </button>
                            <button type="button" className="button-secondary px-4 py-2 text-sm" onClick={clearAll}>
                              Clear all
                            </button>
                            <span className="meta-pill rounded-full px-3 py-2 text-[0.68rem] font-semibold">
                              {activeSectionCount} sections selected
                            </span>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            {options.sections.map((section) => {
                              const checked = selectedSections.includes(section.key);
                              return (
                                <label
                                  key={section.key}
                                  className={[
                                    "flex cursor-pointer items-start gap-3 rounded-[1.1rem] border p-4 transition",
                                    checked
                                      ? "border-accent/24 bg-accent-soft/40"
                                      : section.available
                                        ? "surface-panel"
                                        : "border-line/40 bg-surface-soft/72 opacity-65",
                                  ].join(" ")}
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-1 h-4 w-4 accent-[var(--brand-primary)]"
                                    checked={checked}
                                    disabled={!section.available}
                                    onChange={() => toggleSection(section.key)}
                                  />
                                  <div>
                                    <div className="text-sm font-semibold text-ink">{section.label}</div>
                                    <div className="mt-1 text-sm leading-6 text-muted">
                                      {section.description}
                                    </div>
                                    <div className="mt-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted">
                                      {section.available
                                        ? `${section.row_count ?? 0} rows available`
                                        : "No real data available for this season"}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </section>

                      <section className="surface-panel-quiet rounded-[1.3rem] p-4 text-sm leading-7 text-muted">
                        {multiSectionCsv
                          ? "CSV downloads with multiple sections are packaged as a zip file containing one CSV per selected section plus report metadata."
                          : "JSON preserves the full nested report structure. Single-section CSV downloads are optimized for spreadsheet use."}
                      </section>

                      {error ? (
                        <div className="warning-panel rounded-[1.3rem] p-4 text-sm leading-7 text-muted">
                          {error}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-line/60 px-6 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm leading-6 text-muted">
                      Reports use real catcher-specific data only. No demo payloads or hidden-call assumptions.
                    </div>
                    <button
                      type="button"
                      className="button-primary px-5 py-3 text-sm"
                      disabled={loadingOptions || submitting || !options || selectedSections.length === 0}
                      onClick={handleDownload}
                    >
                      {submitting ? "Generating..." : "Generate download"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}
