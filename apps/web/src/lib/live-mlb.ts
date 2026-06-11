import { NextRequest, NextResponse } from "next/server";

/**
 * Direct MLB Stats API fallback for the /live proxy paths.
 *
 * The FastAPI backend's /live router only relays the public MLB Stats API
 * (statsapi.mlb.com, no key required). When no backend is configured or the
 * backend is unreachable, the web proxy serves the same shapes straight from
 * the source so the Live tab keeps working on a frontend-only deployment.
 * Mirrors packages/python/catcher_intel/src/catcher_intel/live_data.py.
 */

const STATS_API_BASE = "https://statsapi.mlb.com/api";
const HEADSHOT_URL = (playerId: number | string) =>
  `https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`;

const TTL_LIVE_MS = 20_000;
const TTL_SCHEDULE_MS = 120_000;
const TTL_SLOW_MS = 3_600_000;

type JsonRecord = Record<string, unknown>;

const cache = new Map<string, { expiresAt: number; value: unknown }>();

async function fetchJson(path: string, params: Record<string, string>, ttlMs: number) {
  const query = new URLSearchParams(params).toString();
  const url = `${STATS_API_BASE}${path}${query ? `?${query}` : ""}`;

  const hit = cache.get(url);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as JsonRecord;
  }
  cache.delete(url);

  const response = await fetch(url, {
    headers: { "user-agent": "catcher-intel/1.0" },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new LiveFallbackError(response.status, `MLB Stats API error for ${path}`);
  }
  const payload = (await response.json()) as JsonRecord;
  cache.set(url, { expiresAt: Date.now() + ttlMs, value: payload });
  return payload;
}

class LiveFallbackError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function rec(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function teamSummary(game: JsonRecord, side: "home" | "away") {
  const teamNode = rec(rec(game.teams)[side]);
  const team = rec(teamNode.team);
  const record = rec(teamNode.leagueRecord);
  return {
    id: team.id ?? null,
    name: team.name ?? null,
    score: teamNode.score ?? null,
    wins: record.wins ?? null,
    losses: record.losses ?? null,
  };
}

async function liveSchedule(date: string | null) {
  const target = date ?? new Date().toISOString().slice(0, 10);
  const payload = await fetchJson("/v1/schedule", { sportId: "1", date: target }, TTL_SCHEDULE_MS);

  const games = arr(payload.dates).flatMap((day) =>
    arr(rec(day).games).map((value) => {
      const game = rec(value);
      const status = rec(game.status);
      return {
        game_pk: game.gamePk ?? null,
        game_date: game.gameDate ?? null,
        state: status.abstractGameState ?? null,
        detailed_state: status.detailedState ?? null,
        home: teamSummary(game, "home"),
        away: teamSummary(game, "away"),
        venue: rec(game.venue).name ?? null,
      };
    }),
  );
  return { date: target, game_count: games.length, games };
}

async function liveGameCatchers(gamePk: string) {
  const payload = await fetchJson(`/v1/game/${gamePk}/boxscore`, {}, TTL_SCHEDULE_MS);
  const result: { game_pk: number; home: JsonRecord[]; away: JsonRecord[] } = {
    game_pk: Number(gamePk),
    home: [],
    away: [],
  };

  for (const side of ["home", "away"] as const) {
    const players = rec(rec(rec(payload.teams)[side]).players);
    for (const value of Object.values(players)) {
      const player = rec(value);
      const position = String(rec(player.position).abbreviation ?? "").toUpperCase();
      const allPositions = arr(player.allPositions).map((p) =>
        String(rec(p).abbreviation ?? "").toUpperCase(),
      );
      if (position !== "C" && !allPositions.includes("C")) {
        continue;
      }
      const person = rec(player.person);
      const playerId = person.id as number | undefined;
      result[side].push({
        player_id: playerId ?? null,
        name: person.fullName ?? null,
        headshot_url: playerId ? HEADSHOT_URL(playerId) : null,
        starting: position === "C",
        batting_order: player.battingOrder ?? null,
        game_stats_fielding: rec(rec(player.stats).fielding),
      });
    }
    result[side].sort((a, b) =>
      a.starting === b.starting
        ? String(a.name ?? "").localeCompare(String(b.name ?? ""))
        : a.starting
          ? -1
          : 1,
    );
  }
  return result;
}

async function liveGamePitches(gamePk: string, limit: number) {
  const payload = await fetchJson(`/v1.1/game/${gamePk}/feed/live`, {}, TTL_LIVE_MS);
  const allPlays = arr(rec(rec(rec(payload.liveData)).plays).allPlays);

  const pitches: JsonRecord[] = [];
  for (const playValue of allPlays) {
    const play = rec(playValue);
    const about = rec(play.about);
    const matchup = rec(play.matchup);
    for (const eventValue of arr(play.playEvents)) {
      const event = rec(eventValue);
      if (!event.isPitch) {
        continue;
      }
      const details = rec(event.details);
      const pitchData = rec(event.pitchData);
      pitches.push({
        inning: about.inning ?? null,
        half: about.halfInning ?? null,
        at_bat_index: about.atBatIndex ?? null,
        batter: rec(matchup.batter).fullName ?? null,
        pitcher: rec(matchup.pitcher).fullName ?? null,
        pitcher_id: rec(matchup.pitcher).id ?? null,
        count: event.count ?? null,
        pitch_type: rec(details.type).code ?? null,
        pitch_type_description: rec(details.type).description ?? null,
        call: rec(details.call).description ?? null,
        is_strike: details.isStrike ?? null,
        is_ball: details.isBall ?? null,
        is_in_play: details.isInPlay ?? null,
        start_speed: pitchData.startSpeed ?? null,
        zone: pitchData.zone ?? null,
      });
    }
  }

  const status = rec(rec(payload.gameData).status);
  return {
    game_pk: Number(gamePk),
    state: status.abstractGameState ?? null,
    detailed_state: status.detailedState ?? null,
    pitch_count: pitches.length,
    pitches: pitches.reverse().slice(0, limit),
  };
}

async function livePlayerGamelog(playerId: string, season: string | null, statGroup: string) {
  const resolvedSeason = season ?? String(new Date().getFullYear());
  const payload = await fetchJson(
    `/v1/people/${playerId}/stats`,
    { stats: "gameLog", group: statGroup, season: resolvedSeason, sportId: "1" },
    TTL_SLOW_MS,
  );

  const games = arr(payload.stats).flatMap((block) =>
    arr(rec(block).splits).map((value) => {
      const split = rec(value);
      return {
        date: split.date ?? null,
        game_pk: rec(split.game).gamePk ?? null,
        opponent: rec(split.opponent).name ?? null,
        is_home: split.isHome ?? null,
        stats: rec(split.stat),
      };
    }),
  );

  return {
    player_id: Number(playerId),
    season: Number(resolvedSeason),
    stat_group: statGroup,
    headshot_url: HEADSHOT_URL(playerId),
    game_count: games.length,
    games,
  };
}

export function isLivePath(path: string[]) {
  return path[0] === "live";
}

/**
 * Serve a /live/* proxy request straight from the MLB Stats API. Returns the
 * same response shapes as the FastAPI /live router.
 */
export async function handleLiveFallback(request: NextRequest, path: string[]) {
  const params = request.nextUrl.searchParams;
  try {
    if (path.length === 2 && path[1] === "schedule") {
      return NextResponse.json(await liveSchedule(params.get("date")));
    }
    if (path.length === 4 && path[1] === "games" && path[3] === "catchers") {
      return NextResponse.json(await liveGameCatchers(path[2]));
    }
    if (path.length === 4 && path[1] === "games" && path[3] === "pitches") {
      const limit = Math.min(Number(params.get("limit") ?? 200) || 200, 1000);
      return NextResponse.json(await liveGamePitches(path[2], limit));
    }
    if (path.length === 4 && path[1] === "players" && path[3] === "gamelog") {
      const statGroup = params.get("stat_group") ?? "fielding";
      if (!["fielding", "hitting", "catching"].includes(statGroup)) {
        return NextResponse.json({ detail: "Invalid stat_group." }, { status: 422 });
      }
      return NextResponse.json(await livePlayerGamelog(path[2], params.get("season"), statGroup));
    }
    if (path.length === 2 && path[1] === "cache-status") {
      const now = Date.now();
      let fresh = 0;
      cache.forEach((entry) => {
        if (entry.expiresAt > now) {
          fresh += 1;
        }
      });
      return NextResponse.json({ entries: cache.size, fresh_entries: fresh });
    }
    return NextResponse.json({ detail: "Unknown live route." }, { status: 404 });
  } catch (error) {
    if (error instanceof LiveFallbackError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { detail: "MLB Stats API unreachable from the web proxy." },
      { status: 502 },
    );
  }
}
