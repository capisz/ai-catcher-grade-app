"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AiAnalystCard } from "@/components/ai-analyst-card";
import { GameSelect } from "@/components/ui/game-select";
import { LiveZoneGrid } from "@/components/live-zone-grid";
import { LiveGameScoreboard } from "@/components/live-game-scoreboard";
import { PlayerHeadshot } from "@/components/player-headshot";
import { mlbDate, shiftDate, type LiveGameContext } from "@/lib/live-game-context";

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
  game_pk: number;
  context: LiveGameContext;
  pitch_count: number;
  pitches: LivePitch[];
};

async function fetchLiveJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000) });
  if (!response.ok) {
    throw new Error(`Live data request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
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
  const [selectedDate, setSelectedDate] = useState(() => mlbDate());
  const initialSchedule = useRef(true);
  const [feedError, setFeedError] = useState<string | null>(null);
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
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const schedule = await fetchLiveJson<{ games: LiveGame[] }>(
          `/api/backend/live/schedule?date=${selectedDate}`, controller.signal,
        );
        if (controller.signal.aborted) return;
        // At first open, offer the previous completed slate without mixing dates.
        if (initialSchedule.current && !schedule.games.some(game => game.state === "Live" || game.state === "Final")) {
          initialSchedule.current = false;
          const previousDate = shiftDate(selectedDate, -1);
          try {
            const previous = await fetchLiveJson<{ games: LiveGame[] }>(`/api/backend/live/schedule?date=${previousDate}`, controller.signal);
            if (controller.signal.aborted) return;
            if (previous.games.some(game => game.state === "Final" || game.state === "Live")) {
              setSelectedDate(previousDate);
              return;
            }
          } catch {
            if (controller.signal.aborted) return;
          }
        }
        initialSchedule.current = false;
        setGames(schedule.games);
        setScheduleError(null);
        setScheduleLoaded(true);
        setSelectedGamePk(current => schedule.games.some(game => game.game_pk === current) ? current : defaultGame(schedule.games));
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setScheduleError(error instanceof Error ? error.message : "Schedule unavailable.");
          setScheduleLoaded(true);
        }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 60_000);
      }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [selectedDate]);

  useEffect(() => {
    if (selectedGamePk == null) return;
    const controller = new AbortController();
    let feedTimer: ReturnType<typeof setTimeout>;
    let reportTimer: ReturnType<typeof setTimeout>;
    // Independent loops: a slow zone report cannot hold up the scoreboard.
    // Schedule the next refresh after completion to avoid overlapping requests.
    const loadFeed = async () => {
      try {
        const payload = await fetchLiveJson<PitchFeed>(`/api/backend/live/games/${selectedGamePk}/pitches?limit=1000`, controller.signal);
        if (controller.signal.aborted) return;
        setFeed(payload);
        setFeedError(null);
        setLastUpdated(new Date());
      } catch (error) {
        if (!controller.signal.aborted) setFeedError(error instanceof Error ? error.message : "Game feed unavailable.");
      } finally {
        if (!controller.signal.aborted) feedTimer = setTimeout(loadFeed, PITCH_POLL_MS);
      }
    };
    const loadReport = async () => {
      try {
        const payload = await fetchLiveJson<ZoneReport>(`/api/backend/live/games/${selectedGamePk}/zone-report`, controller.signal);
        if (controller.signal.aborted) return;
        setReport(payload);
        setReportError(null);
      } catch (error) {
        if (!controller.signal.aborted) setReportError(error instanceof Error ? error.message : "Zone report unavailable.");
      } finally {
        if (!controller.signal.aborted) reportTimer = setTimeout(loadReport, PITCH_POLL_MS);
      }
    };
    void loadFeed();
    void loadReport();
    return () => { controller.abort(); clearTimeout(feedTimer); clearTimeout(reportTimer); };
  }, [selectedGamePk]);

  function selectGame(gamePk: number) {
    setSelectedGamePk(gamePk);
    setReport(null);
    setFeed(null);
    setReportError(null);
    setFeedError(null);
    setLastUpdated(null);
    setShowAllPitches(false);
  }

  function selectDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    initialSchedule.current = false;
    setSelectedDate(date);
    setGames([]);
    setSelectedGamePk(null);
    setReport(null);
    setFeed(null);
    setLastUpdated(null);
    setScheduleLoaded(false);
    setScheduleError(null);
    setFeedError(null);
    setReportError(null);
  }

  const selectedGame = useMemo(
    () => games.find((game) => game.game_pk === selectedGamePk),
    [games, selectedGamePk],
  );

  const activeReport = report?.game_pk === selectedGamePk ? report : null;
  const activeFeed = feed?.game_pk === selectedGamePk ? feed : null;
  const sideReport = activeReport?.sides[selectedSide] ?? null;
  const sideTeam = selectedSide === "home" ? selectedGame?.home.name : selectedGame?.away.name;
  const pitches = activeFeed?.pitches ?? [];
  const visiblePitches = showAllPitches ? pitches : pitches.slice(0, STREAM_PREVIEW_COUNT);

  return (
    <div className="space-y-5">
      <div className="surface-panel rounded-xl p-4">
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 space-y-2 sm:max-w-52">
            <span className="label-kicker" title="Eastern time">Game date · ET</span>
            <input aria-label="Game date" type="date" value={selectedDate} onChange={event => selectDate(event.target.value)} className="field w-full" />
          </label>
          <button type="button" onClick={() => selectDate(shiftDate(selectedDate, -1))} className="button-secondary px-3 py-2.5 text-xs" aria-label="Previous day">←</button>
          <button type="button" onClick={() => selectDate(mlbDate())} className="button-secondary px-3 py-2.5 text-xs">Today</button>
          <button type="button" onClick={() => selectDate(shiftDate(selectedDate, 1))} className="button-secondary px-3 py-2.5 text-xs" aria-label="Next day">→</button>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="block min-w-0 flex-1 space-y-2">
            <span className="text-[0.64rem] font-semibold uppercase tracking-[0.06em] text-muted">
              Game ({games.length} on selected date)
            </span>
            <GameSelect games={games.map(game => activeFeed?.context && game.game_pk === activeFeed.game_pk ? { ...game, state: activeFeed.context.state, detailed_state: activeFeed.context.detailed_state, home: { ...game.home, score: activeFeed.context.teams.home.runs }, away: { ...game.away, score: activeFeed.context.teams.away.runs } } : game)} value={selectedGamePk} onChange={selectGame} />
          </label>
          <div className="flex flex-wrap items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-muted">
            <span className="pill-sand rounded-full px-3 py-1.5">
              {activeFeed?.context?.detailed_state ?? selectedGame?.detailed_state ?? "Scheduled"}
            </span>
            {lastUpdated ? (
              <span className="meta-pill rounded-full px-3 py-1.5">
                Checked {lastUpdated.toLocaleTimeString()}
              </span>
            ) : null}
          </div>
        </div>

        {!scheduleLoaded ? <p className="mt-3 text-sm text-muted">Loading schedule...</p> : null}
        {scheduleError ? <p role="status" className="mt-3 text-sm text-negative">{scheduleError} Retrying automatically.</p> : null}
        {scheduleLoaded && !scheduleError && games.length === 0 ? <p className="mt-3 text-sm text-muted">No MLB games on this date. Choose another day.</p> : null}
        {activeReport ? (
          <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
            {(["away", "home"] as const).map(side => {
              const sideData = activeReport.sides[side];
              const team = side === "home" ? selectedGame?.home.name : selectedGame?.away.name;
              const active = side === selectedSide;
              return (
                <button key={side} type="button" onClick={() => setSelectedSide(side)} aria-pressed={active}
                  className={`flex min-w-[15rem] flex-1 items-center gap-3 rounded-lg border-2 p-3 text-left transition ${active ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-muted"}`}>
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-muted">{side} · Team zone grade</div>
                    <div className="mt-1 truncate text-sm font-semibold text-ink">{team ?? side}</div>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {sideData.catchers.length ? sideData.catchers.map(catcher => <span key={catcher.player_id ?? catcher.name} className="flex w-[72px] flex-col items-center gap-1.5 text-center">
                        <PlayerHeadshot playerId={catcher.player_id} name={catcher.name} src={catcher.headshot_url} size={56} className="rounded-full" />
                        <span className="text-[10px] leading-4 text-muted-strong">{catcher.name ?? "Catcher"}</span>
                      </span>) : <span className="text-xs text-muted">Catcher lineup pending</span>}
                    </div>
                  </div>
                  <span className="numeric text-xl font-bold text-accent">{sideData.grade ?? "—"}</span>
                </button>
              );
            })}
          </div>
        ) : reportError ? (
          <p className="mt-4 text-sm leading-6 text-muted">{reportError}</p>
        ) : selectedGamePk != null ? (
          <p className="mt-4 text-sm leading-6 text-muted">Building zone report...</p>
        ) : null}
      </div>

      {reportError && activeReport ? <p role="status" className="warning-panel rounded-xl p-4 text-sm">Zone report could not refresh. Showing the last successful zone data.</p> : null}
      {feedError ? <p role="status" className="warning-panel rounded-xl p-4 text-sm">{feedError} {activeFeed ? "Showing the last successful update." : "Retrying automatically."}</p> : null}
      {activeFeed?.context ? <LiveGameScoreboard context={activeFeed.context} /> : selectedGamePk != null ? <div className="surface-panel rounded-xl p-5 text-sm text-muted">Loading scoreboard and game situation...</div> : null}

      {sideReport && selectedGamePk != null ? (
        <AiAnalystCard
          gamePk={selectedGamePk}
          side={selectedSide}
          catcherName={null}
          pitchesLocated={sideReport.pitches_located}
        />
      ) : null}

      {sideReport ? (
        <div className="grid min-w-0 grid-cols-1 gap-5 min-[1440px]:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <section className="panel-dark rounded-xl p-5 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-white/60">
                  Game-calling vs batter hot zones
                </div>
                <h2 className="mt-2 font-serif text-xl text-white">
                  {sideTeam ?? "Team"}
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
                  {activeReport?.batters_with_zone_data ?? 0}
                </div>
                <div className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-white/55">
                  Batters w/ zone data
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-white/55">
              20-80 grade for how often called pitches land away from each batter&apos;s hottest
              season zones. This is a team-wide measure across all catchers who appeared, not an individual catcher grade. In-zone pitches only.
            </p>
          </section>

          <section className="surface-panel rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="label-kicker">Pitch stream</div>
              <span className="meta-pill rounded-full px-3 py-1.5 text-[0.62rem] font-semibold uppercase tracking-[0.06em]">
                {activeFeed ? `${activeFeed.pitch_count.toLocaleString()} pitches` : "Waiting"}
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
