"""Live MLB data integration for Catcher Intel.

Pulls live and game-by-game data from the public MLB Stats API
(statsapi.mlb.com) with a small in-memory TTL cache. No API key required
and no new third-party dependencies (stdlib urllib only, called from sync
endpoints which FastAPI runs in its threadpool).

Endpoints (mounted under /live):
  GET /live/schedule?date=YYYY-MM-DD     -> games for a date (default: today)
  GET /live/games/{game_pk}/catchers    -> catchers on both rosters w/ headshots
  GET /live/games/{game_pk}/pitches     -> pitch-by-pitch event stream
  GET /live/players/{player_id}/gamelog -> game-by-game stat log
  GET /live/cache-status                -> cache diagnostics
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date as date_cls
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/live", tags=["live"])

STATS_API_BASE = "https://statsapi.mlb.com/api"
HEADSHOT_URL = (
    "https://img.mlbstatic.com/mlb-photos/image/upload/"
    "w_213,q_auto:best/v1/people/{player_id}/headshot/67/current"
)

# ---------------------------------------------------------------------------
# Tiny TTL cache (per-process). Live feeds get a short TTL, slow-moving data
# a longer one, so the public demo never hammers MLB's API.
# ---------------------------------------------------------------------------

_CACHE: dict[str, tuple[float, Any]] = {}

TTL_LIVE_SECONDS = 20          # live game feeds
TTL_SCHEDULE_SECONDS = 120     # schedules / boxscores
TTL_SLOW_SECONDS = 3600        # game logs, rosters


def _cache_get(key: str) -> Any | None:
    hit = _CACHE.get(key)
    if hit is None:
        return None
    expires_at, value = hit
    if time.monotonic() > expires_at:
        _CACHE.pop(key, None)
        return None
    return value


def _cache_set(key: str, value: Any, ttl: float) -> None:
    _CACHE[key] = (time.monotonic() + ttl, value)


def _fetch_json(path: str, params: dict[str, Any] | None = None, ttl: float = TTL_SCHEDULE_SECONDS) -> Any:
    query = urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v is not None})
    url = f"{STATS_API_BASE}{path}"
    if query:
        url = f"{url}?{query}"

    cached = _cache_get(url)
    if cached is not None:
        return cached

    request = urllib.request.Request(url, headers={"User-Agent": "catcher-intel/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:  # pragma: no cover - passthrough
        raise HTTPException(status_code=exc.code, detail=f"MLB Stats API error for {path}") from exc
    except urllib.error.URLError as exc:  # pragma: no cover - passthrough
        raise HTTPException(status_code=502, detail=f"MLB Stats API unreachable: {exc.reason}") from exc

    _cache_set(url, payload, ttl)
    return payload


def headshot_for(player_id: int | str) -> str:
    return HEADSHOT_URL.format(player_id=player_id)


@router.get("/schedule")
def live_schedule(date: Optional[str] = Query(default=None, description="YYYY-MM-DD; defaults to today")) -> dict:
    """All MLB games for a date with status and team info."""
    target = date or date_cls.today().isoformat()
    payload = _fetch_json("/v1/schedule", {"sportId": 1, "date": target}, ttl=TTL_SCHEDULE_SECONDS)

    games = []
    for day in payload.get("dates", []):
        for game in day.get("games", []):
            status = game.get("status", {})
            games.append(
                {
                    "game_pk": game.get("gamePk"),
                    "game_date": game.get("gameDate"),
                    "state": status.get("abstractGameState"),
                    "detailed_state": status.get("detailedState"),
                    "home": _team_summary(game, "home"),
                    "away": _team_summary(game, "away"),
                    "venue": (game.get("venue") or {}).get("name"),
                }
            )
    return {"date": target, "game_count": len(games), "games": games}


def _team_summary(game: dict, side: str) -> dict:
    team_node = (game.get("teams") or {}).get(side, {})
    team = team_node.get("team", {})
    return {
        "id": team.get("id"),
        "name": team.get("name"),
        "score": team_node.get("score"),
        "wins": (team_node.get("leagueRecord") or {}).get("wins"),
        "losses": (team_node.get("leagueRecord") or {}).get("losses"),
    }


@router.get("/games/{game_pk}/catchers")
def live_game_catchers(game_pk: int) -> dict:
    """Catchers on both boxscore rosters for a game, with headshot URLs."""
    payload = _fetch_json(f"/v1/game/{game_pk}/boxscore", ttl=TTL_SCHEDULE_SECONDS)
    result: dict[str, Any] = {"game_pk": game_pk, "home": [], "away": []}

    for side in ("home", "away"):
        team_node = (payload.get("teams") or {}).get(side, {})
        players = team_node.get("players", {}) or {}
        for player in players.values():
            position = ((player.get("position") or {}).get("abbreviation") or "").upper()
            all_positions = {
                (p.get("abbreviation") or "").upper() for p in player.get("allPositions", []) or []
            }
            if position != "C" and "C" not in all_positions:
                continue
            person = player.get("person", {})
            player_id = person.get("id")
            result[side].append(
                {
                    "player_id": player_id,
                    "name": person.get("fullName"),
                    "headshot_url": headshot_for(player_id) if player_id else None,
                    "starting": position == "C",
                    "batting_order": player.get("battingOrder"),
                    "game_stats_fielding": ((player.get("stats") or {}).get("fielding") or {}),
                }
            )
        result[side].sort(key=lambda row: (not row["starting"], row["name"] or ""))
    return result


@router.get("/games/{game_pk}/pitches")
def live_game_pitches(game_pk: int, limit: int = Query(default=200, le=1000)) -> dict:
    """Pitch-by-pitch event stream from the live feed (most recent first)."""
    payload = _fetch_json(f"/v1.1/game/{game_pk}/feed/live", ttl=TTL_LIVE_SECONDS)
    live_data = payload.get("liveData", {})
    all_plays = (live_data.get("plays") or {}).get("allPlays", []) or []

    pitches: list[dict] = []
    for play in all_plays:
        about = play.get("about", {})
        matchup = play.get("matchup", {})
        for event in play.get("playEvents", []) or []:
            if not event.get("isPitch"):
                continue
            details = event.get("details", {})
            pitch_data = event.get("pitchData", {})
            pitches.append(
                {
                    "inning": about.get("inning"),
                    "half": about.get("halfInning"),
                    "at_bat_index": about.get("atBatIndex"),
                    "batter": (matchup.get("batter") or {}).get("fullName"),
                    "batter_id": (matchup.get("batter") or {}).get("id"),
                    "pitcher": (matchup.get("pitcher") or {}).get("fullName"),
                    "pitcher_id": (matchup.get("pitcher") or {}).get("id"),
                    "count": event.get("count"),
                    "pitch_type": (details.get("type") or {}).get("code"),
                    "pitch_type_description": (details.get("type") or {}).get("description"),
                    "call": (details.get("call") or {}).get("description"),
                    "is_strike": details.get("isStrike"),
                    "is_ball": details.get("isBall"),
                    "is_in_play": details.get("isInPlay"),
                    "start_speed": pitch_data.get("startSpeed"),
                    "zone": pitch_data.get("zone"),
                }
            )

    status = (payload.get("gameData") or {}).get("status", {})
    return {
        "game_pk": game_pk,
        "state": status.get("abstractGameState"),
        "detailed_state": status.get("detailedState"),
        "pitch_count": len(pitches),
        "pitches": list(reversed(pitches))[:limit],
    }


def _parse_hot_zones(payload: Any) -> dict:
    """Extract batting-average zone values from a hotColdZones stats payload.

    Returns {"values": {zone_int: float}, "hotness": {zone_int: 0..1},
    "top": set(top-3 zone ints)} over strike zones 1-9, or an empty dict when
    the batter has no usable zone data.
    """
    zone_values: dict = {}
    for stat_block in payload.get("stats", []) or []:
        for split in stat_block.get("splits", []) or []:
            stat = split.get("stat", {}) or {}
            if stat.get("name") != "battingAverage":
                continue
            for zone in stat.get("zones", []) or []:
                try:
                    zone_number = int(zone.get("zone"))
                except (TypeError, ValueError):
                    continue
                if not 1 <= zone_number <= 9:
                    continue
                raw_value = zone.get("value")
                try:
                    zone_values[zone_number] = float(raw_value)
                except (TypeError, ValueError):
                    continue

    # Hotness needs at least two zones to rank against each other.
    if len(zone_values) < 2:
        return {}

    ordered = sorted(zone_values.items(), key=lambda item: item[1])
    span = len(ordered) - 1
    hotness = {zone: rank / span for rank, (zone, _) in enumerate(ordered)}
    top = {zone for zone, _ in ordered[-3:]}
    return {"values": zone_values, "hotness": hotness, "top": top}


def _score_side(side_pitches: list, zones_by_batter: dict) -> dict:
    """Aggregate one fielding side's called pitches against batter hot zones."""
    cells = {
        zone: {"pitches": 0, "hot_sum": 0.0, "value_sum": 0.0, "value_count": 0}
        for zone in range(1, 10)
    }
    located = 0
    hotness_total = 0.0
    top_zone_hits = 0

    for pitch in side_pitches:
        zone = pitch.get("zone")
        batter_zones = zones_by_batter.get(pitch.get("batter_id"))
        if not batter_zones or not isinstance(zone, int) or not 1 <= zone <= 9:
            continue
        hotness = batter_zones["hotness"].get(zone)
        if hotness is None:
            continue
        located += 1
        hotness_total += hotness
        cells[zone]["pitches"] += 1
        cells[zone]["hot_sum"] += hotness
        value = batter_zones["values"].get(zone)
        if value is not None:
            cells[zone]["value_sum"] += value
            cells[zone]["value_count"] += 1
        if zone in batter_zones["top"]:
            top_zone_hits += 1

    if located == 0:
        return {
            "grade": None,
            "score": None,
            "pitches_located": 0,
            "hot_zone_pitch_pct": None,
            "zones": [
                {"zone": zone, "pitches": 0, "pitch_share": None,
                 "avg_batter_hotness": None, "avg_batter_value": None}
                for zone in range(1, 10)
            ],
        }

    score = 1.0 - (hotness_total / located)
    grade = max(20, min(80, round(20 + 60 * score)))
    return {
        "grade": grade,
        "score": round(score, 4),
        "pitches_located": located,
        "hot_zone_pitch_pct": round(top_zone_hits / located, 4),
        "zones": [
            {
                "zone": zone,
                "pitches": cell["pitches"],
                "pitch_share": round(cell["pitches"] / located, 4),
                "avg_batter_hotness": (
                    round(cell["hot_sum"] / cell["pitches"], 4) if cell["pitches"] else None
                ),
                "avg_batter_value": (
                    round(cell["value_sum"] / cell["value_count"], 4)
                    if cell["value_count"]
                    else None
                ),
            }
            for zone, cell in sorted(cells.items())
        ],
    }


@router.get("/games/{game_pk}/zone-report")
def live_game_zone_report(game_pk: int) -> dict:
    """Per-catcher game-calling zone report for a live or finished game.

    Scores how often each side's called pitches avoid the current batters'
    hottest strike zones (season hot/cold zone batting averages).
    """
    payload = _fetch_json(f"/v1.1/game/{game_pk}/feed/live", ttl=TTL_LIVE_SECONDS)
    game_data = payload.get("gameData", {}) or {}
    season = (game_data.get("game") or {}).get("season") or date_cls.today().year

    side_pitches: dict = {"home": [], "away": []}
    batter_ids: dict = {"home": set(), "away": set()}
    all_plays = ((payload.get("liveData") or {}).get("plays") or {}).get("allPlays", []) or []
    for play in all_plays:
        about = play.get("about", {}) or {}
        matchup = play.get("matchup", {}) or {}
        batter_id = (matchup.get("batter") or {}).get("id")
        # Top half: home team fields, so the home catcher is calling pitches.
        side = "home" if about.get("halfInning") == "top" else "away"
        for event in play.get("playEvents", []) or []:
            if not event.get("isPitch"):
                continue
            zone = (event.get("pitchData") or {}).get("zone")
            side_pitches[side].append({"zone": zone, "batter_id": batter_id})
            if batter_id is not None:
                batter_ids[side].add(batter_id)

    zones_by_batter: dict = {}
    for batter_id in batter_ids["home"] | batter_ids["away"]:
        try:
            stats_payload = _fetch_json(
                f"/v1/people/{batter_id}/stats",
                {"stats": "hotColdZones", "group": "hitting", "season": season, "sportId": 1},
                ttl=TTL_SLOW_SECONDS,
            )
        except HTTPException:
            continue
        parsed = _parse_hot_zones(stats_payload)
        if parsed:
            zones_by_batter[batter_id] = parsed

    catchers = live_game_catchers(game_pk)
    status = game_data.get("status", {}) or {}
    sides = {}
    for side in ("home", "away"):
        report = _score_side(side_pitches[side], zones_by_batter)
        report["catcher"] = (catchers.get(side) or [{}])[0] or None
        report["catchers"] = catchers.get(side) or []
        sides[side] = report

    return {
        "game_pk": game_pk,
        "state": status.get("abstractGameState"),
        "detailed_state": status.get("detailedState"),
        "season": season,
        "batters_with_zone_data": len(zones_by_batter),
        "sides": sides,
    }


@router.get("/players/{player_id}/gamelog")
def live_player_gamelog(
    player_id: int,
    season: Optional[int] = Query(default=None),
    stat_group: str = Query(default="fielding", pattern="^(fielding|hitting|catching)$"),
) -> dict:
    """Game-by-game stat log for a player from the MLB Stats API."""
    resolved_season = season or date_cls.today().year
    group = "catching" if stat_group == "catching" else stat_group
    payload = _fetch_json(
        f"/v1/people/{player_id}/stats",
        {"stats": "gameLog", "group": group, "season": resolved_season, "sportId": 1},
        ttl=TTL_SLOW_SECONDS,
    )

    splits = []
    for stat_block in payload.get("stats", []) or []:
        for split in stat_block.get("splits", []) or []:
            splits.append(
                {
                    "date": split.get("date"),
                    "game_pk": (split.get("game") or {}).get("gamePk"),
                    "opponent": (split.get("opponent") or {}).get("name"),
                    "is_home": split.get("isHome"),
                    "stats": split.get("stat", {}),
                }
            )

    return {
        "player_id": player_id,
        "season": resolved_season,
        "stat_group": stat_group,
        "headshot_url": headshot_for(player_id),
        "game_count": len(splits),
        "games": splits,
    }


@router.get("/cache-status")
def live_cache_status() -> dict:
    """Lightweight diagnostics for the in-memory cache."""
    now = time.monotonic()
    fresh = sum(1 for expires_at, _ in _CACHE.values() if expires_at > now)
    return {"entries": len(_CACHE), "fresh_entries": fresh}
