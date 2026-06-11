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
        batter_id: rec(matchup.batter).id ?? null,
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

type BatterZones = {
  values: Map<number, number>;
  hotness: Map<number, number>;
  top: Set<number>;
};

function parseHotZones(payload: JsonRecord): BatterZones | null {
  const values = new Map<number, number>();
  for (const block of arr(payload.stats)) {
    for (const split of arr(rec(block).splits)) {
      const stat = rec(rec(split).stat);
      if (stat.name !== "battingAverage") {
        continue;
      }
      for (const zoneValue of arr(stat.zones)) {
        const zone = rec(zoneValue);
        const zoneNumber = Number(zone.zone);
        const value = Number(zone.value);
        if (Number.isInteger(zoneNumber) && zoneNumber >= 1 && zoneNumber <= 9 && Number.isFinite(value)) {
          values.set(zoneNumber, value);
        }
      }
    }
  }
  if (values.size < 2) {
    return null;
  }
  const ordered = [...values.entries()].sort((a, b) => a[1] - b[1]);
  const span = ordered.length - 1;
  const hotness = new Map(ordered.map(([zone], rank) => [zone, rank / span]));
  const top = new Set(ordered.slice(-3).map(([zone]) => zone));
  return { values, hotness, top };
}

function scoreSide(
  sidePitches: { zone: unknown; batterId: unknown }[],
  zonesByBatter: Map<number, BatterZones>,
) {
  const cells = new Map(
    Array.from({ length: 9 }, (_, i) => [
      i + 1,
      { pitches: 0, hotSum: 0, valueSum: 0, valueCount: 0 },
    ]),
  );
  let located = 0;
  let hotnessTotal = 0;
  let topZoneHits = 0;

  for (const pitch of sidePitches) {
    const zone = pitch.zone;
    const batter = zonesByBatter.get(Number(pitch.batterId));
    if (!batter || typeof zone !== "number" || zone < 1 || zone > 9) {
      continue;
    }
    const hotness = batter.hotness.get(zone);
    if (hotness === undefined) {
      continue;
    }
    located += 1;
    hotnessTotal += hotness;
    const cell = cells.get(zone)!;
    cell.pitches += 1;
    cell.hotSum += hotness;
    const value = batter.values.get(zone);
    if (value !== undefined) {
      cell.valueSum += value;
      cell.valueCount += 1;
    }
    if (batter.top.has(zone)) {
      topZoneHits += 1;
    }
  }

  const round4 = (value: number) => Math.round(value * 10000) / 10000;
  if (located === 0) {
    return {
      grade: null,
      score: null,
      pitches_located: 0,
      hot_zone_pitch_pct: null,
      zones: [...cells.keys()].map((zone) => ({
        zone,
        pitches: 0,
        pitch_share: null,
        avg_batter_hotness: null,
        avg_batter_value: null,
      })),
    };
  }

  const score = 1 - hotnessTotal / located;
  const grade = Math.max(20, Math.min(80, Math.round(20 + 60 * score)));
  return {
    grade,
    score: round4(score),
    pitches_located: located,
    hot_zone_pitch_pct: round4(topZoneHits / located),
    zones: [...cells.entries()].map(([zone, cell]) => ({
      zone,
      pitches: cell.pitches,
      pitch_share: round4(cell.pitches / located),
      avg_batter_hotness: cell.pitches ? round4(cell.hotSum / cell.pitches) : null,
      avg_batter_value: cell.valueCount ? round4(cell.valueSum / cell.valueCount) : null,
    })),
  };
}

async function liveGameZoneReport(gamePk: string) {
  const payload = await fetchJson(`/v1.1/game/${gamePk}/feed/live`, {}, TTL_LIVE_MS);
  const gameData = rec(payload.gameData);
  const season = String(rec(gameData.game).season ?? new Date().getFullYear());

  const sidePitches: Record<"home" | "away", { zone: unknown; batterId: unknown }[]> = {
    home: [],
    away: [],
  };
  const batterIds = new Set<number>();
  const allPlays = arr(rec(rec(payload.liveData).plays).allPlays);
  for (const playValue of allPlays) {
    const play = rec(playValue);
    const about = rec(play.about);
    const batterId = rec(rec(play.matchup).batter).id;
    // Top half: home team fields, so the home catcher is calling pitches.
    const side = about.halfInning === "top" ? "home" : "away";
    for (const eventValue of arr(play.playEvents)) {
      const event = rec(eventValue);
      if (!event.isPitch) {
        continue;
      }
      sidePitches[side].push({ zone: rec(event.pitchData).zone, batterId });
      if (typeof batterId === "number") {
        batterIds.add(batterId);
      }
    }
  }

  const zonesByBatter = new Map<number, BatterZones>();
  await Promise.all(
    [...batterIds].map(async (batterId) => {
      try {
        const stats = await fetchJson(
          `/v1/people/${batterId}/stats`,
          { stats: "hotColdZones", group: "hitting", season, sportId: "1" },
          TTL_SLOW_MS,
        );
        const parsed = parseHotZones(stats);
        if (parsed) {
          zonesByBatter.set(batterId, parsed);
        }
      } catch {
        // Batters without zone data are simply excluded from scoring.
      }
    }),
  );

  const catchers = await liveGameCatchers(gamePk);
  const status = rec(gameData.status);
  const sides: JsonRecord = {};
  for (const side of ["home", "away"] as const) {
    const report: JsonRecord = scoreSide(sidePitches[side], zonesByBatter);
    report.catcher = catchers[side][0] ?? null;
    report.catchers = catchers[side];
    sides[side] = report;
  }

  return {
    game_pk: Number(gamePk),
    state: status.abstractGameState ?? null,
    detailed_state: status.detailedState ?? null,
    season,
    batters_with_zone_data: zonesByBatter.size,
    sides,
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
    if (path.length === 4 && path[1] === "games" && path[3] === "zone-report") {
      return NextResponse.json(await liveGameZoneReport(path[2]));
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
