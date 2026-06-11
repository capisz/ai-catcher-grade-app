import Link from "next/link";

import { SectionCard } from "@/components/section-card";

export const dynamic = "force-dynamic";

export default function GameReviewPage() {
  return (
    <div className="space-y-8">
      <section className="card rounded-xl px-5 py-5 sm:px-6 sm:py-6 lg:px-7">
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="label-kicker">Game Review</div>
            <h1 className="mt-4 max-w-3xl font-serif text-2xl leading-tight text-ink sm:text-3xl">
              Single-game battery review is staged for the next release.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-muted">
              The current product is strongest as a catcher scouting and matchup-intelligence
              suite. This page is reserved for pitch-by-pitch game review once the inning timeline
              and at-bat review API surfaces are ready.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/" className="button-primary px-4 py-2.5 text-sm">
                Open catcher dashboard
              </Link>
              <Link href="/matchup-explorer" className="button-secondary px-4 py-2.5 text-sm">
                Open matchup explorer
              </Link>
            </div>
          </div>

          <div className="panel-dark rounded-xl p-5 text-white sm:p-6">
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-white/56">
              Planned review stack
            </div>
            <div className="mt-5 grid gap-3">
              {[
                "inning timeline with leverage swings",
                "pitch-by-pitch call review against baseline",
                "battery notes for pitcher-catcher sequencing",
                "receiving and execution context on called/taken pitches",
              ].map((item) => (
                <div
                  key={item}
                  className="scorebug rounded-lg border border-white/10 px-4 py-3 text-sm leading-6 text-white/78"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SectionCard
        eyebrow="Why It Is Parked"
        title="The repo is keeping game review honest"
        subtitle="Rather than shipping a thin placeholder timeline, the UI holds this surface until the underlying game-level API is ready."
        tone="quiet"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="surface-panel rounded-lg p-5 text-sm leading-6 text-muted">
            The current app is already useful for season-level catcher evaluation and matchup
            planning because those surfaces are backed by real scored rows and real recommendation
            logic.
          </div>
          <div className="surface-panel rounded-lg p-5 text-sm leading-6 text-muted">
            Game review will land once the repo exposes clean per-game sequences, inning segments,
            and pitch review notes without inventing unavailable context.
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
