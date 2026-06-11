"""Tests for the live-data layer (no network needed)."""

from __future__ import annotations

import time

from catcher_intel import live_data


def test_ttl_cache_set_get_and_expiry(monkeypatch):
    live_data._CACHE.clear()
    live_data._cache_set("k", {"v": 1}, ttl=100)
    assert live_data._cache_get("k") == {"v": 1}

    # Force expiry by faking monotonic time forward.
    real_monotonic = time.monotonic
    monkeypatch.setattr(live_data.time, "monotonic", lambda: real_monotonic() + 101)
    assert live_data._cache_get("k") is None
    assert "k" not in live_data._CACHE  # expired entries are evicted


def test_headshot_url_shape():
    url = live_data.headshot_for(672275)
    assert "672275" in url and url.startswith("https://img.mlbstatic.com/")


def test_schedule_parses_fixture(monkeypatch):
    fixture = {
        "dates": [
            {
                "games": [
                    {
                        "gamePk": 999,
                        "gameDate": "2026-06-10T23:05:00Z",
                        "status": {"abstractGameState": "Live", "detailedState": "In Progress"},
                        "venue": {"name": "Yankee Stadium"},
                        "teams": {
                            "home": {"team": {"id": 147, "name": "New York Yankees"}, "score": 3,
                                     "leagueRecord": {"wins": 40, "losses": 25}},
                            "away": {"team": {"id": 111, "name": "Boston Red Sox"}, "score": 1,
                                     "leagueRecord": {"wins": 35, "losses": 30}},
                        },
                    }
                ]
            }
        ]
    }
    monkeypatch.setattr(live_data, "_fetch_json", lambda *a, **k: fixture)
    out = live_data.live_schedule(date="2026-06-10")
    assert out["game_count"] == 1
    game = out["games"][0]
    assert game["game_pk"] == 999
    assert game["home"]["name"] == "New York Yankees"
    assert game["state"] == "Live"


def test_game_catchers_filters_to_catchers_only(monkeypatch):
    fixture = {
        "teams": {
            "home": {
                "players": {
                    "ID1": {"person": {"id": 1, "fullName": "Backstop Bob"},
                            "position": {"abbreviation": "C"}, "allPositions": [{"abbreviation": "C"}],
                            "stats": {"fielding": {"putOuts": 7}}},
                    "ID2": {"person": {"id": 2, "fullName": "Shortstop Sam"},
                            "position": {"abbreviation": "SS"}, "allPositions": [{"abbreviation": "SS"}]},
                }
            },
            "away": {"players": {}},
        }
    }
    monkeypatch.setattr(live_data, "_fetch_json", lambda *a, **k: fixture)
    out = live_data.live_game_catchers(game_pk=999)
    assert [c["name"] for c in out["home"]] == ["Backstop Bob"]
    assert out["home"][0]["starting"] is True
    assert out["away"] == []


def test_game_pitches_extracts_pitch_events(monkeypatch):
    fixture = {
        "gameData": {"status": {"abstractGameState": "Live", "detailedState": "In Progress"}},
        "liveData": {
            "plays": {
                "allPlays": [
                    {
                        "about": {"inning": 1, "halfInning": "top", "atBatIndex": 0},
                        "matchup": {"batter": {"fullName": "A"}, "pitcher": {"id": 9, "fullName": "P"}},
                        "playEvents": [
                            {"isPitch": True,
                             "details": {"type": {"code": "FF", "description": "Four-Seam Fastball"},
                                          "call": {"description": "Called Strike"}, "isStrike": True},
                             "count": {"balls": 0, "strikes": 1},
                             "pitchData": {"startSpeed": 96.4, "zone": 5}},
                            {"isPitch": False, "details": {}},
                        ],
                    }
                ]
            }
        },
    }
    monkeypatch.setattr(live_data, "_fetch_json", lambda *a, **k: fixture)
    out = live_data.live_game_pitches(game_pk=999, limit=200)
    assert out["pitch_count"] == 1
    pitch = out["pitches"][0]
    assert pitch["pitch_type"] == "FF" and pitch["start_speed"] == 96.4 and pitch["zone"] == 5
