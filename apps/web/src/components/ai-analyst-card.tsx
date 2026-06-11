"use client";

import { useEffect, useRef, useState } from "react";

type AiAnalystCardProps = {
  gamePk: number;
  side: "home" | "away";
  catcherName: string | null;
  pitchesLocated: number;
};

type AnalystState = "unknown" | "unavailable" | "idle" | "streaming" | "done" | "error";

/**
 * Streams a Claude-written read of the selected catcher's zone report.
 * Renders nothing until the server reports an Anthropic API key is configured,
 * so deployments without a key look identical to today.
 */
export function AiAnalystCard({ gamePk, side, catcherName, pitchesLocated }: AiAnalystCardProps) {
  const [state, setState] = useState<AnalystState>("unknown");
  const [text, setText] = useState("");
  const analyzedKeyRef = useRef<string | null>(null);
  const currentKey = `${gamePk}:${side}:${pitchesLocated}`;

  useEffect(() => {
    let cancelled = false;
    // Probe with an invalid body: a keyless deployment answers 503
    // ai_not_configured before validation, a keyed one answers 400.
    fetch("/api/ai/live-analysis", { method: "POST", body: "{}" })
      .then(async (response) => {
        if (cancelled) {
          return;
        }
        if (response.status === 503) {
          setState("unavailable");
        } else {
          setState("idle");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState("unavailable");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const analyze = async () => {
    setState("streaming");
    setText("");
    analyzedKeyRef.current = currentKey;
    try {
      const response = await fetch("/api/ai/live-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gamePk, side }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`Analysis request failed (${response.status}).`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let collected = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        collected += decoder.decode(value, { stream: true });
        setText(collected);
      }
      setState("done");
    } catch {
      setState("error");
    }
  };

  if (state === "unknown" || state === "unavailable") {
    return null;
  }

  const stale = state === "done" && analyzedKeyRef.current !== currentKey;
  const canAnalyze = pitchesLocated > 0 && state !== "streaming";

  return (
    <section className="surface-panel rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label-kicker">AI Analyst</div>
          <div className="mt-1 text-sm font-semibold text-ink">
            {catcherName ? `${catcherName}'s game-calling, read by Claude` : "Game-calling analysis"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="meta-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.06em]">
            Claude Opus 4.8
          </span>
          <button
            onClick={analyze}
            disabled={!canAnalyze}
            className="button-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state === "streaming"
              ? "Analyzing..."
              : state === "done"
                ? stale
                  ? "Re-analyze (new pitches)"
                  : "Re-analyze"
                : "Analyze game-calling"}
          </button>
        </div>
      </div>

      {text ? (
        <div className="mt-4 whitespace-pre-wrap border-t border-line pt-4 text-sm leading-7 text-ink">
          {text}
          {state === "streaming" ? <span className="animate-pulse text-accent">▌</span> : null}
        </div>
      ) : state === "error" ? (
        <p className="mt-4 text-sm leading-6 text-muted">
          The analysis could not be generated right now. Try again in a moment.
        </p>
      ) : pitchesLocated === 0 ? (
        <p className="mt-4 text-sm leading-6 text-muted">
          Analysis unlocks once this game has scored pitches to read.
        </p>
      ) : (
        <p className="mt-4 text-sm leading-6 text-muted">
          Generates a grounded read of the zone report above — which hot zones are being avoided or
          fed, and what the recent pitch sequence says about the game plan.
        </p>
      )}
    </section>
  );
}
