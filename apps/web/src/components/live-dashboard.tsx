"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

import { LiveZoneGrid } from "@/components/live-zone-grid";

const PITCH_POLL_MS = 20_000;
const STREAM_PREVIEW_COUNT = 12;

type LiveTeam = {
  id: number | null;
  name: string | null;
  score: number | null;
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

type ZoneCell = {
  zone: number;
  pitches: number;
  pitch_share: number | null;
  avg_batter_hotness: number | null;
  avg_batter_value: number | null;
};

type SideReport = {
  grade: number | null;
  score: number | null;
  pitches_located: number;
  hot_zone_pitch_pct: number | null;
  zones: ZoneCell[];
  catcher: LiveCatcher | null;
  catchers: LiveCatcher[];
};

type ZoneReport = {
  game_pk: number;
  state: string | null;
  detailed_state: string | null;
  batters_with_zone_data: number;
  sides: { home: SideReport; away: SideReport };
};

type LivePitch = {
  inning: number | null;
  half: string | null;
  at_bat_index: number | null;
  batter: string | null;
  pitcher: string | null;
  count: { balls?: number; strikes?: number } | null;
  pitch_type: string | null;
  pitch_type_description: string | null;
  call: string | null;
  start_speed: number | null;
  zone: number | null;
};

type PitchFeed = {
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

function gradeLabel(grade: number | null) {
  if (grade == null) {
    return "No data yet";
  }
  if (grade >= 70) {
    return "Elite avoidance";
  }
  if (grade >= 60) {
    return "Plus avoidance";
  }
  if (grade >= 50) {
    return "Average avoidance";
  }
  if (grade >= 40) {
    return "Below average";
  }
  return "Feeding hot zones";
}

function formatCount(count: LivePitch["count"]) {
  if (!count) {
    return "--";
  }
  return `${count.balls ?? 0}-${count.strikes ?? 0}`;
}

function defaultGame(games: LiveGame[]) {
  const live = games.find((game) => game.state === "Live");
  if (live) {
    return live.game_pk;
  }
  const finals = games.filter((game) => game.state === "Final");
  if (finals.length > 0) {
    return finals[finals.length - 1].game_pk;
  }
  return games[0]?.game_pk ?? null;
}

export function LiveDashboard() {
  const [games, setGames] = useState<LiveGame[]>([]);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [selectedGamePk, setSelectedGamePk] = useState<number | null>(null);
  const [report, setReport] = useState<ZoneReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [selectedSide, setSelectedSide] = useState<"home" | "away">("home");
  const [feed, setFeed] = useState<PitchFeed | null>(null);
  const [showAllPitches, setShowAllPitches] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const today = await fetchLiveJson<{ games: LiveGame[] }>("/api/backend/live/schedule");
        let allGames = today.games;
        // Off-hours: nothing live or finished today yet, so offer yesterday's
        // finals so the zone report has real pitches to grade.
        if (!allGames.some((game) => game.state === "Live" || game.state === "Final")) {
          const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
          try {
            const previous = await fetchLiveJson<{ games: LiveGame[] }>(
              `/api/backend/live/schedule?date=${yesterday}`,
            );
            allGames = [...previous.games.filter((game) => game.state === "Final"), ...allGames];
          } catch {
            // Yesterday's slate is a nice-to-have; ignore failures.
          }
        }
        if (!cancelled) {
          setGames(allGames);
          setScheduleLoaded(true);
          setSelectedGamePk((current) => current ?? defaultGame(allGames));
        }
      } catch (error: unknown) {
        if (!cancelled) {
          setScheduleError(error instanceof Error ? error.message : "Schedule unavailable.");
          setScheduleLoaded(true);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback((gamePk: number) => {
    fetchLiveJson<ZoneReport>(`/api/backend/live/games/${gamePk}/zone-report`)
      .then((payload) => {
        setReport(payload);
        setReportError(null);
        setLastUpdated(new Date());
      })
      .catch((error: unknown) => {
        setReportError(error instanceof Error ? error.message : "Zone report unavailable.");
      });
    fetchLiveJson<PitchFeed>(`/api/backend/live/games/${gamePk}/pitches?limit=300`)
      .then(setFeed)
      .catch(() => setFeed(null));
  }, []);

  useEffect(() => {
    if (selectedGamePk == null) {
      return;
    }
    setReport(null);
    setFeed(null);
    setReportError(null);
    refresh(selectedGamePk);
    const interval = setInterval(() => refresh(selectedGamePk), PITCH_POLL_MS);
    return () => clearInterval(interval);
  }, [selectedGamePk, refresh]);

  const selectedGame = useMemo(
    () => games.find((game) => game.game_pk === selectedGamePk),
    [games, selectedGamePk],
  );

  if (!scheduleLoaded) {
    return (
      <div className="surface-panel rounded-xl p-6 text-sm leading-6 text-muted">
        Loading today&apos;s MLB schedule...
      </div>
    );
  }

  if (scheduleError) {
    return (
      <div className="warning-panel rounded-xl p-6">
        <div className="label-kicker">Live feed unavailable</div>
        <p className="mt-3 text-sm leading-6 text-muted">{scheduleError}</p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="surface-panel rounded-xl p-6 text-sm leading-6 text-muted">
        No MLB games are scheduled today.
      </div>
    );
  }

  const sideReport = report?.sides[selectedSide] ?? null;
  const sideTeam = selectedSide === "home" ? selectedGame?.home.name : selectedGame?.away.name;
  const pitches = feed?.pitches ?? [];
  const visiblePitches = showAllPitches ? pitches : pitches.slice(0, STREAM_PREVIEW_COUNT);

  return (
    <div className="space-y-5">
      <div className="surface-panel rounded-xl p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="block min-w-0 flex-1 space-y-2">
            <span className="text-[0.64rem] font-semibold uppercase tracking-[0.06em] text-muted">
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
          <div className="flex flex-wrap items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-muted">
            <span className="pill-sand rounded-full px-3 py-1.5">
              {selectedGame?.detailed_state ?? "Unknown"}
            </span>
            {lastUpdated ? (
              <span className="meta-pill rounded-full px-3 py-1.5">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            ) : null}
          </div>
        </div>

        {report ? (
          <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
            {(["away", "home"] as const).flatMap((side) =>
              report.sides[side].catchers.map((catcher) => {
                const active = side === selectedSide;
                const grade = report.sides[side].grade;
                return (
                  <button
                    key={`${side}-${catcher.player_id ?? catcher.name}`}
                    onClick={() => setSelectedSide(side)}
                    className={[
                      "flex min-w-[15rem] items-center gap-3 rounded-lg border-2 p-3 text-left transition",
                      active
                        ? "border-accent bg-accent/10"
                        : "border-line bg-surface hover:border-muted",
                    ].join(" ")}
                  >
                    {catcher.headshot_url ? (
                      <Image
                        src={catcher.headshot_url}
                        alt={catcher.name ?? "Catcher"}
                        width={44}
                        height={44}
                        className="h-11 w-11 rounded-full border border-line object-cover"
                      />
                    ) : (
                      <div className="dark-pill flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold">
                        {(catcher.name ?? "?")[0]}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-ink">
                        {catcher.name ?? "Unknown"}
                      </div>
                      <div className="mt-0.5 truncate text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-muted">
                        {(side === "home" ? selectedGame?.home.name : selectedGame?.away.name) ?? side}
                      </div>
                    </div>
                    <div
                      className={[
                        "numeric rounded-md px-2.5 py-1.5 font-serif text-lg font-bold",
                        grade != null && grade >= 50
                          ? "bg-positive-soft text-positive"
                          : grade != null
                            ? "bg-negative-soft text-negative"
                            : "meta-pill text-muted",
                      ].join(" ")}
                    >
                      {grade ?? "--"}
                    </div>
                  </button>
                );
              }),
            )}
          </div>
        ) : reportError ? (
          <p className="mt-4 text-sm leading-6 text-muted">{reportError}</p>
        ) : (
          <p className="mt-4 text-sm leading-6 text-muted">Building zone report...</p>
        )}
      </div>

      {sideReport ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
          <section className="panel-dark rounded-xl p-5 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-white/60">
                  Game-calling vs batter hot zones
                </div>
                <h2 className="mt-2 font-serif text-xl text-white">
                  {sideReport.catcher?.name ?? "Catcher"}
                  <span className="ml-2 text-sm font-medium text-white/60">{sideTeam}</span>
                </h2>
              </div>
              <div className="text-right">
                <div className="numeric font-serif text-5xl font-bold leading-none text-white">
                  {sideReport.grade ?? "--"}
                </div>
                <div className="mt-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-white/60">
                  {gradeLabel(sideReport.grade)}
                </div>
              </div>
            </div>

            <div className="mt-5">
              <LiveZoneGrid zones={sideReport.zones} />
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/12 pt-4 text-center">
              <div>
                <div className="numeric font-serif text-xl font-bold text-white">
                  {sideReport.pitches_located}
                </div>
                <div className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-white/55">
                  Pitches scored
                </div>
              </div>
              <div>
                <div className="numeric font-serif text-xl font-bold text-white">
                  {sideReport.hot_zone_pitch_pct != null
                    ? `${(sideReport.hot_zone_pitch_pct * 100).toFixed(0)}%`
                    : "--"}
                </div>
                <div className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-white/55">
                  Into batter top-3 zones
                </div>
              </div>
              <div>
                <div className="numeric font-serif text-xl font-bold text-white">
                  {report?.batters_with_zone_data ?? 0}
                </div>
                <div className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-white/55">
                  Batters w/ zone data
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-white/55">
              20-80 grade for how often called pitches land away from each batter&apos;s hottest
              season zones. In-zone pitches only; attributed to the side&apos;s current catcher.
            </p>
          </section>

          <section className="surface-panel rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="label-kicker">Pitch stream</div>
              <span className="meta-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.06em]">
                {feed ? `${feed.pitch_count.toLocaleString()} pitches` : "Waiting"}
              </span>
            </div>
            {visiblePitches.length > 0 ? (
              <>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-left text-sm">
                    <thead>
                      <tr className="text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-muted">
                        <th className="px-2 py-1.5">Inn</th>
                        <th className="px-2 py-1.5">Count</th>
                        <th className="px-2 py-1.5">Batter</th>
                        <th className="px-2 py-1.5">Pitch</th>
                        <th className="px-2 py-1.5">Velo</th>
                        <th className="px-2 py-1.5">Zone</th>
                        <th className="px-2 py-1.5">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePitches.map((pitch, index) => (
                        <tr key={`${pitch.at_bat_index}-${index}`} className="border-t border-line/60 text-ink">
                          <td className="numeric px-2 py-1.5 whitespace-nowrap">
                            {pitch.half === "top" ? "T" : "B"}{pitch.inning ?? "-"}
                          </td>
                          <td className="numeric px-2 py-1.5">{formatCount(pitch.count)}</td>
                          <td className="max-w-[9rem] truncate px-2 py-1.5">{pitch.batter ?? "--"}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{pitch.pitch_type ?? "--"}</td>
                          <td className="numeric px-2 py-1.5">
                            {pitch.start_speed != null ? pitch.start_speed.toFixed(0) : "--"}
                          </td>
                          <td className="numeric px-2 py-1.5">{pitch.zone ?? "--"}</td>
                          <td className="max-w-[10rem] truncate px-2 py-1.5 text-muted">{pitch.call ?? "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pitches.length > STREAM_PREVIEW_COUNT ? (
                  <button
                    onClick={() => setShowAllPitches((value) => !value)}
                    className="button-secondary mt-3 px-3 py-1.5 text-xs"
                  >
                    {showAllPitches ? "Show fewer" : `Show all ${pitches.length}`}
                  </button>
                ) : null}
              </>
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted">
                No pitches yet — the stream and zone report fill in at first pitch
                {selectedGame?.game_date
                  ? ` (${new Date(selectedGame.game_date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })})`
                  : ""}.
              </p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
