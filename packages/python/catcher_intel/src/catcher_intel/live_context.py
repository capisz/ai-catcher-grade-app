"""Public MLB game-feed projection; mirrors the frontend-only fallback."""
from datetime import datetime
from zoneinfo import ZoneInfo


def mlb_date():
    return datetime.now(ZoneInfo("America/New_York")).date().isoformat()


def person(value):
    value = value or {}
    return {"id": value.get("id"), "name": value.get("fullName")}


def game_context(payload):
    game = payload.get("gameData") or {}
    live = payload.get("liveData") or {}
    line = live.get("linescore") or {}
    plays = live.get("plays") or {}
    matchup = (plays.get("currentPlay") or {}).get("matchup") or {}
    offense, defense = line.get("offense") or {}, line.get("defense") or {}
    status, weather = game.get("status") or {}, game.get("weather") or {}
    teams = {}
    for side in ("away", "home"):
        team = (game.get("teams") or {}).get(side) or {}
        totals = (line.get("teams") or {}).get(side) or {}
        teams[side] = {"name": team.get("name"), "abbreviation": team.get("abbreviation"),
                       **{key: totals.get(key) for key in ("runs", "hits", "errors")}}
    recent = []
    for play in reversed([p for p in plays.get("allPlays", []) if (p.get("about") or {}).get("isComplete")][-5:]):
        about, result = play.get("about") or {}, play.get("result") or {}
        recent.append({"inning": about.get("inning"), "half": about.get("halfInning"),
                       "description": result.get("description"), "scoring": about.get("isScoringPlay") is True,
                       "away_score": result.get("awayScore"), "home_score": result.get("homeScore")})
    return {
        "game_pk": payload.get("gamePk"), "state": status.get("abstractGameState"),
        "detailed_state": status.get("detailedState"),
        "start_time": (game.get("datetime") or {}).get("dateTime"),
        "venue": (game.get("venue") or {}).get("name"),
        "weather": {"condition": weather.get("condition"), "temperature": weather.get("temp"), "wind": weather.get("wind")},
        "inning": line.get("currentInning"), "inning_state": line.get("inningState"),
        "scheduled_innings": line.get("scheduledInnings"),
        **{key: line.get(key) for key in ("balls", "strikes", "outs")},
        "teams": teams,
        "innings": [{"num": inning.get("num"), "away": (inning.get("away") or {}).get("runs"),
                     "home": (inning.get("home") or {}).get("runs")} for inning in line.get("innings", [])],
        "matchup": {"batter": person(offense.get("batter") or matchup.get("batter")),
                    "pitcher": person(defense.get("pitcher") or matchup.get("pitcher")),
                    "catcher": person(defense.get("catcher")), "on_deck": person(offense.get("onDeck")),
                    "batter_hand": (matchup.get("batSide") or {}).get("code"),
                    "pitcher_hand": (matchup.get("pitchHand") or {}).get("code")},
        "runners": {base: person(offense.get(base)) for base in ("first", "second", "third")},
        "probable_pitchers": {side: person((game.get("probablePitchers") or {}).get(side)) for side in ("away", "home")},
        "decisions": {key: person((live.get("decisions") or {}).get(key)) for key in ("winner", "loser", "save")},
        "recent_plays": recent,
    }
