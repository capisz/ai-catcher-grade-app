"use client";

import { useEffect, useRef, useState } from "react";

type GameTeam = {
  name: string | null;
  score: number | null;
};

export type SelectableGame = {
  game_pk: number;
  state: string | null;
  detailed_state: string | null;
  home: GameTeam;
  away: GameTeam;
  venue: string | null;
};

type GameSelectProps = {
  games: SelectableGame[];
  value: number | null;
  onChange: (gamePk: number) => void;
};

function statusChip(game: SelectableGame) {
  if (game.state === "Live") {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-positive/40 bg-positive-soft px-2.5 py-1 text-[0.6rem] font-bold uppercase tracking-[0.08em] text-positive">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-positive" />
        Live
      </span>
    );
  }
  return (
    <span className="meta-pill rounded-full px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.06em]">
      {game.detailed_state ?? game.state ?? "Scheduled"}
    </span>
  );
}

function matchupLabel(game: SelectableGame) {
  const away = game.away.name ?? "Away";
  const home = game.home.name ?? "Home";
  const score =
    game.away.score != null && game.home.score != null
      ? ` (${game.away.score}-${game.home.score})`
      : "";
  return `${away} @ ${home}${score}`;
}

/**
 * Fully themed replacement for the native game <select> — the native popup
 * can't be styled, so this renders its own navy listbox with status chips.
 */
export function GameSelect({ games, value, onChange }: GameSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = games.find((game) => game.game_pk === value) ?? null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field flex items-center justify-between gap-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="truncate font-medium text-ink">
            {selected ? matchupLabel(selected) : "Select a game"}
          </span>
          {selected ? statusChip(selected) : null}
        </span>
        <svg
          viewBox="0 0 12 12"
          className={["h-3 w-3 shrink-0 text-muted transition-transform", open ? "rotate-180" : ""].join(" ")}
          fill="none"
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-2 max-h-80 overflow-y-auto rounded-lg border border-line-strong/0 bg-surface-elevated p-1.5 shadow-[0_0_0_1px_#243355,0_24px_48px_-16px_rgba(2,6,16,0.9)]"
        >
          {games.map((game) => {
            const isSelected = game.game_pk === value;
            return (
              <button
                key={game.game_pk}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(game.game_pk);
                  setOpen(false);
                }}
                className={[
                  "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition",
                  isSelected
                    ? "bg-accent/15 text-ink"
                    : "text-secondary hover:bg-accent/8 hover:text-ink",
                ].join(" ")}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{matchupLabel(game)}</span>
                  {game.venue ? (
                    <span className="mt-0.5 block truncate text-[0.66rem] uppercase tracking-[0.06em] text-muted">
                      {game.venue}
                    </span>
                  ) : null}
                </span>
                {statusChip(game)}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
