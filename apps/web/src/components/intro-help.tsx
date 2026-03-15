"use client";

import { useEffect, useState } from "react";

import { BaseballLogo } from "@/components/icons/baseball-logo";
import { useGlobalLoading } from "@/components/ui/loading-provider";

const STORAGE_KEY = "catcher-intel-intro-dismissed";

export function IntroHelp() {
  const { isLoading } = useGlobalLoading();
  const [shouldAutoOpen, setShouldAutoOpen] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      return window.localStorage.getItem(STORAGE_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!shouldAutoOpen || isLoading) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setOpen(true);
      setShouldAutoOpen(false);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isLoading, shouldAutoOpen]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const dismiss = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore localStorage failures and allow the overlay to behave as session-only.
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Open dashboard guide"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-line/70 bg-surface-elevated/88 text-sm font-semibold text-ink shadow-[0_10px_20px_rgba(68,83,95,0.08)] transition hover:border-accent/30 hover:bg-surface-soft hover:text-accent-clay"
        onClick={() => setOpen(true)}
      >
        ?
      </button>

      {open ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-4 py-8">
          <button
            type="button"
            aria-label="Close dashboard guide"
            className="absolute inset-0 bg-[rgba(68,83,95,0.42)] backdrop-blur-[10px]"
            onClick={dismiss}
          />
          <section className="card relative z-10 w-full max-w-3xl overflow-hidden rounded-[1.85rem] p-6 sm:p-7">
            <div className="hero-wash pointer-events-none absolute inset-x-0 top-0 h-28 opacity-90" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] border border-line/70 bg-surface-elevated text-brand-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.46)]">
                    <BaseballLogo className="h-9 w-9" />
                  </div>
                  <div>
                    <div className="label-kicker">Dashboard Guide</div>
                    <h2 className="mt-2 font-serif text-[2rem] leading-none text-ink sm:text-[2.3rem]">
                      What this app is showing you
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
                      Catcher Intel uses public Statcast data and public catcher-defense signals to
                      summarize pitch-decision quality, pairing context, and season-level scouting
                      indicators. It is a decision-support dashboard, not a claim about hidden
                      intent.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="button-secondary h-11 px-4 py-2 text-sm"
                  onClick={dismiss}
                >
                  Close
                </button>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <article className="surface-panel rounded-[1.35rem] p-4">
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-accent-clay">
                    What It Does
                  </div>
                  <p className="mt-3 text-sm leading-7 text-muted">
                    Compares the pitch that was actually called to a realistic baseline of other
                    pitch options in the same public game context, then rolls that up into catcher,
                    count, pitch-type, and pitcher-pairing views.
                  </p>
                </article>
                <article className="surface-panel rounded-[1.35rem] p-4">
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-accent-clay">
                    How To Read It
                  </div>
                  <p className="mt-3 text-sm leading-7 text-muted">
                    Positive DVA means the observed pitch choice outperformed the modeled baseline.
                    Negative DVA means it trailed the baseline. Grades are relative season comps on
                    a 20-80 style scouting scale, not absolute truth.
                  </p>
                </article>
                <article className="surface-panel rounded-[1.35rem] p-4">
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-accent-clay">
                    Interpretation Notes
                  </div>
                  <p className="mt-3 text-sm leading-7 text-muted">
                    Sample size matters. Use pitch totals and stability badges before leaning too
                    hard on small differences. Public framing, blocking, and throwing metrics are
                    supporting context, not isolated proof of catcher game-calling skill.
                  </p>
                </article>
              </div>

              <div className="mt-5 rounded-[1.25rem] border border-brand-secondary/20 bg-brand-secondary/10 px-4 py-3 text-sm leading-7 text-muted">
                Best use: treat this as a fast scouting lens for identifying interesting signals,
                then combine it with video, coaching context, pitcher tendencies, and sample-size
                judgment.
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
