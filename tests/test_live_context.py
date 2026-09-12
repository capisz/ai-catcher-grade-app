import copy
import json
import unittest
from pathlib import Path

from catcher_intel.live_context import game_context


class GameContextTests(unittest.TestCase):
    def setUp(self):
        self.feed = json.loads((Path(__file__).parent / "fixtures/mlb-game.json").read_text())

    def test_final_preserves_unplayed_half_inning(self):
        context = game_context(self.feed)
        self.assertEqual(context["teams"]["home"]["runs"], 12)
        self.assertEqual(context["teams"]["away"]["runs"], 2)
        self.assertIsNone(context["innings"][-1]["home"])
        self.assertEqual(context["decisions"]["winner"]["name"], "Shota Imanaga")

    def test_preview_does_not_invent_scores_or_players(self):
        self.feed["liveData"] = {}
        context = game_context(self.feed)
        self.assertIsNone(context["teams"]["home"]["runs"])
        self.assertIsNone(context["matchup"]["catcher"]["id"])
        self.assertEqual(context["recent_plays"], [])
        self.assertIsNotNone(context["probable_pitchers"]["home"]["name"])

    def test_current_players_and_runners_come_from_field_state(self):
        feed = copy.deepcopy(self.feed)
        line = feed["liveData"]["linescore"]
        line["offense"]["first"] = {"id": 123, "fullName": "Test Runner"}
        line["offense"]["batter"] = {"id": 124, "fullName": "Next Batter"}
        context = game_context(feed)
        self.assertEqual(context["runners"]["first"]["name"], "Test Runner")
        self.assertIsNone(context["runners"]["second"]["id"])
        self.assertEqual(context["matchup"]["batter"]["name"], "Next Batter")
        self.assertEqual(context["matchup"]["catcher"]["name"], "Carson Kelly")


if __name__ == "__main__":
    unittest.main()
