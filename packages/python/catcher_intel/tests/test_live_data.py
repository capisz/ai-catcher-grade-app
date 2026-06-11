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


def test_parse_hot_zones_extracts_batting_average_zones():
    payload = {
        "stats": [
            {
                "splits": [
                    {"stat": {"name": "onBasePercentage", "zones": [
                        {"zone": "01", "value": ".900"}]}},
                    {"stat": {"name": "battingAverage", "zones": [
                        {"zone": "01", "value": ".150"},
                        {"zone": "02", "value": ".450"},
                        {"zone": "05", "value": ".300"},
                        {"zone": "09", "value": "-"},
                        {"zone": "12", "value": ".400"},
                    ]}},
                ]
            }
        ]
    }
    parsed = live_data._parse_hot_zones(payload)
    assert set(parsed["values"]) == {1, 2, 5}  # "-" and out-of-zone 12 skipped
    assert parsed["hotness"][1] == 0.0  # coldest
    assert parsed["hotness"][2] == 1.0  # hottest
    assert 2 in parsed["top"]


def test_score_side_rewards_avoiding_hot_zones():
    zones_by_batter = {
        10: live_data._parse_hot_zones({
            "stats": [{"splits": [{"stat": {"name": "battingAverage", "zones": [
                {"zone": "01", "value": ".100"},
                {"zone": "02", "value": ".250"},
                {"zone": "03", "value": ".500"},
            ]}}]}]
        })
    }
    cold_calls = [{"zone": 1, "batter_id": 10}] * 5
    hot_calls = [{"zone": 3, "batter_id": 10}] * 5

    cold_report = live_data._score_side(cold_calls, zones_by_batter)
    hot_report = live_data._score_side(hot_calls, zones_by_batter)

    assert 20 <= hot_report["grade"] <= cold_report["grade"] <= 80
    assert cold_report["grade"] == 80  # all pitches in the coldest zone
    assert hot_report["grade"] == 20  # all pitches in the hottest zone
    assert cold_report["pitches_located"] == 5
    assert cold_report["zones"][0]["pitch_share"] == 1.0
    assert cold_report["zones"][0]["avg_batter_value"] == 0.1


def test_score_side_handles_no_locatable_pitches():
    report = live_data._score_side([{"zone": None, "batter_id": 1}], {})
    assert report["grade"] is None
    assert report["pitches_located"] == 0
    assert len(report["zones"]) == 9


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
