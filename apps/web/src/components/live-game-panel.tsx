"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

const SCHEDULE_URL = "/api/backend/live/schedule";
const PITCH_POLL_MS = 20_000;

type LiveTeam = {
  id: number | null;
  name: string | null;
  score: number | null;
  wins: number | null;
  losses: number | null;
};

type LiveGame = {
  game_pk: number;
  game_date: string | null;
  state: string | null;
  detailed_state: string | null;
  home: LiveTeam;
  away: LiveTeam;
  venue: string | null;
};

type LiveCatcher = {
  player_id: number | null;
  name: string | null;
  headshot_url: string | null;
  starting: boolean;
};

type LivePitch = {
  inning: number | null;
  half: string | null;
  at_bat_index: number | null;
  batter: string | null;
  pitcher: string | null;
  count: { balls?: number; strikes?: number; outs?: number } | null;
  pitch_type: string | null;
  pitch_type_description: string | null;
  call: string | null;
  start_speed: number | null;
  zone: number | null;
};

type PitchFeed = {
  state: string | null;
  detailed_state: string | null;
  pitch_count: number;
  pitches: LivePitch[];
};

async function fetchLiveJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Live data request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

function gameLabel(game: LiveGame) {
  const away = game.away.name ?? "Away";
  const home = game.home.name ?? "Home";
  const score =
    game.away.score != null && game.home.score != null
      ? ` (${game.away.score}-${game.home.score})`
      : "";
  return `${away} @ ${home}${score} | ${game.detailed_state ?? game.state ?? "Unknown"}`;
}

function formatCount(count: LivePitch["count"]) {
  if (!count) {
    return "--";
  }
  return `${count.balls ?? 0}-${count.strikes ?? 0}`;
}

function CatcherChip({ catcher }: { catcher: LiveCatcher }) {
  return (
    <div className="surface-panel flex items-center gap-3 rounded-[1rem] p-3">
      {catcher.headshot_url ? (
        <Image
          src={catcher.headshot_url}
          alt={catcher.name ?? "Catcher"}
          width={48}
          height={48}
          className="h-12 w-12 rounded-full border border-line/60 object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-strong text-sm font-semibold text-white">
          {(catcher.name ?? "?")[0]}
        </div>
      )}
      <div>
        <div className="text-sm font-semibold text-ink">{catcher.name ?? "Unknown"}</div>
        <div className="mt-1 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">
          {catcher.starting ? "Starting catcher" : "Roster catcher"}
        </div>
      </div>
    </div>
  );
}

export function LiveGamePanel() {
  const [games, setGames] = useState<LiveGame[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [selectedGamePk, setSelectedGamePk] = useState<number | null>(null);
  const [catchers, setCatchers] = useState<{ home: LiveCatcher[]; away: LiveCatcher[] } | null>(
    null,
  );
  const [feed, setFeed] = useState<PitchFeed | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLiveJson<{ games: LiveGame[] }>(SCHEDULE_URL)
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setGames(payload.games);
        setScheduleLoaded(true);
        const liveGame = payload.games.find((game) => game.state === "Live");
        setSelectedGamePk((current) => current ?? liveGame?.game_pk ?? payload.games[0]?.game_pk ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setScheduleError(error instanceof Error ? error.message : "Schedule unavailable.");
          setScheduleLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshFeed = useCallback((gamePk: number) => {
    fetchLiveJson<PitchFeed>(`/api/backend/live/games/${gamePk}/pitches?limit=60`)
      .then((payload) => {
        setFeed(payload);
        setFeedError(null);
        setLastUpdated(new Date());
      })
      .catch((error: unknown) => {
        setFeedError(error instanceof Error ? error.message : "Pitch feed unavailable.");
      });
  }, []);

  useEffect(() => {
    if (selectedGamePk == null) {
      return;
    }
    setFeed(null);
    setCatchers(null);
    setFeedError(null);

    fetchLiveJson<{ home: LiveCatcher[]; away: LiveCatcher[] }>(
      `/api/backend/live/games/${selectedGamePk}/catchers`,
    )
      .then(setCatchers)
      .catch(() => setCatchers({ home: [], away: [] }));

    refreshFeed(selectedGamePk);
    const interval = setInterval(() => refreshFeed(selectedGamePk), PITCH_POLL_MS);
    return () => clearInterval(interval);
  }, [selectedGamePk, refreshFeed]);

  const selectedGame = useMemo(
    () => games.find((game) => game.game_pk === selectedGamePk),
    [games, selectedGamePk],
  );

  if (!scheduleLoaded) {
    return (
      <div className="surface-panel rounded-[1.45rem] p-6 text-sm leading-7 text-muted">
        Loading today&apos;s MLB schedule...
      </div>
    );
  }

  if (scheduleError) {
    return (
      <div className="warning-panel rounded-[1.45rem] p-6">
        <div className="label-kicker">Live feed unavailable</div>
        <p className="mt-3 text-sm leading-7 text-muted">{scheduleError}</p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="surface-panel rounded-[1.45rem] p-6 text-sm leading-7 text-muted">
        No MLB games are scheduled today.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="surface-panel rounded-[1.45rem] p-5">
        <label className="block space-y-2">
          <span className="text-[0.64rem] font-semibold uppercase tracking-[0.18em] text-muted">
            Game ({games.length} today)
          </span>
          <select
            className="field"
            value={selectedGamePk ?? ""}
            onChange={(event) => setSelectedGamePk(Number(event.target.value))}
          >
            {games.map((game) => (
              <option key={game.game_pk} value={game.game_pk}>
                {gameLabel(game)}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">
          <span className="meta-pill rounded-full px-3 py-1.5">
            {selectedGame?.detailed_state ?? "Unknown state"}
          </span>
          {selectedGame?.venue ? (
            <span className="meta-pill rounded-full px-3 py-1.5">{selectedGame.venue}</span>
          ) : null}
          <span className="meta-pill rounded-full px-3 py-1.5">
            Auto-refresh every {PITCH_POLL_MS / 1000}s
          </span>
          {lastUpdated ? (
            <span className="meta-pill rounded-full px-3 py-1.5">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      </div>

      {catchers ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {(["away", "home"] as const).map((side) => (
            <div key={side} className="surface-panel rounded-[1.45rem] p-5">
              <div className="label-kicker">
                {side === "home" ? selectedGame?.home.name ?? "Home" : selectedGame?.away.name ?? "Away"}{" "}
                catchers
              </div>
              <div className="mt-4 space-y-3">
                {catchers[side].length > 0 ? (
                  catchers[side].map((catcher) => (
                    <CatcherChip key={catcher.player_id ?? catcher.name} catcher={catcher} />
                  ))
                ) : (
                  <p className="text-sm leading-7 text-muted">
                    No catchers listed on the boxscore roster yet.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="surface-panel rounded-[1.45rem] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="label-kicker">Pitch-by-pitch stream</div>
          <span className="meta-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em]">
            {feed ? `${feed.pitch_count.toLocaleString()} pitches tracked` : "Waiting for feed"}
          </span>
        </div>

        {feedError ? (
          <p className="mt-4 text-sm leading-7 text-muted">{feedError}</p>
        ) : null}

        {feed && feed.pitches.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted">
                  <th className="px-2 py-2">Inning</th>
                  <th className="px-2 py-2">Count</th>
                  <th className="px-2 py-2">Pitcher</th>
                  <th className="px-2 py-2">Batter</th>
                  <th className="px-2 py-2">Pitch</th>
                  <th className="px-2 py-2">Velo</th>
                  <th className="px-2 py-2">Zone</th>
                  <th className="px-2 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {feed.pitches.map((pitch, index) => (
                  <tr
                    key={`${pitch.at_bat_index}-${index}`}
                    className="border-t border-line/50 text-ink"
                  >
                    <td className="px-2 py-2 whitespace-nowrap">
                      {pitch.half === "top" ? "Top" : "Bot"} {pitch.inning ?? "--"}
                    </td>
                    <td className="numeric px-2 py-2">{formatCount(pitch.count)}</td>
                    <td className="px-2 py-2">{pitch.pitcher ?? "--"}</td>
                    <td className="px-2 py-2">{pitch.batter ?? "--"}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {pitch.pitch_type_description ?? pitch.pitch_type ?? "--"}
                    </td>
                    <td className="numeric px-2 py-2">
                      {pitch.start_speed != null ? `${pitch.start_speed.toFixed(1)} mph` : "--"}
                    </td>
                    <td className="numeric px-2 py-2">{pitch.zone ?? "--"}</td>
                    <td className="px-2 py-2">{pitch.call ?? "--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : feed && !feedError ? (
          <p className="mt-4 text-sm leading-7 text-muted">
            No pitches in the feed yet for this game.
          </p>
        ) : null}
      </div>
    </div>
  );
}
