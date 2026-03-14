from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from catcher_intel.feature_engineering import make_pitch_uid

DEMO_CATCHERS = [
    (669257, "Will Smith", "LAD"),
    (663728, "Cal Raleigh", "SEA"),
    (668939, "Adley Rutschman", "BAL"),
    (672275, "Patrick Bailey", "SF"),
]


def build_demo_pitch_frame(seed: int = 7, pitch_count: int = 1600) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    catcher_lookup = {
        101: DEMO_CATCHERS[0],
        102: DEMO_CATCHERS[1],
        103: DEMO_CATCHERS[2],
        104: DEMO_CATCHERS[3],
    }
    pitch_types = {
        "FF": {"name": "4-Seam Fastball", "velo": 96.2, "spin": 2330, "pfx_x": -0.1, "pfx_z": 1.4},
        "SL": {"name": "Slider", "velo": 86.4, "spin": 2470, "pfx_x": 0.5, "pfx_z": 0.1},
        "CH": {"name": "Changeup", "velo": 84.1, "spin": 1820, "pfx_x": -0.6, "pfx_z": 0.7},
        "CU": {"name": "Curveball", "velo": 80.3, "spin": 2710, "pfx_x": 0.2, "pfx_z": -0.9},
        "SI": {"name": "Sinker", "velo": 94.6, "spin": 2210, "pfx_x": -0.8, "pfx_z": 0.6},
    }

    rows: list[dict[str, object]] = []
    base_date = date(2025, 4, 1)
    for index in range(pitch_count):
        game_slot = index // 60
        at_bat_slot = index // 5
        catcher_seed = 101 + (index % 4)
        catcher_id, _, _ = catcher_lookup[catcher_seed]
        pitch_type = list(pitch_types)[index % len(pitch_types)]
        pitch_profile = pitch_types[pitch_type]
        balls = int(rng.integers(0, 4))
        strikes = int(rng.integers(0, 3))
        plate_x = float(rng.normal(0.0 if pitch_type in {"FF", "SI"} else 0.35, 0.55))
        plate_z = float(rng.normal(2.7 if pitch_type == "FF" else 1.9, 0.45))
        stand = "L" if rng.random() > 0.48 else "R"
        p_throws = "L" if index % 5 == 0 else "R"
        on_1b = 850000 + index if rng.random() > 0.6 else np.nan
        on_2b = 860000 + index if rng.random() > 0.78 else np.nan
        on_3b = 870000 + index if rng.random() > 0.9 else np.nan
        chase_bonus = -0.03 if abs(plate_x) > 0.85 or plate_z < 1.45 or plate_z > 3.45 else 0.0
        platoon_bonus = -0.012 if stand == p_throws else 0.005
        velocity_bonus = -0.001 * (pitch_profile["velo"] - 90)
        movement_bonus = -0.01 * abs(pitch_profile["pfx_x"])
        fastball_penalty = 0.016 if pitch_type == "FF" and balls >= 2 else 0.0
        delta_run_exp = float(
            rng.normal(0.0, 0.045)
            + chase_bonus
            + platoon_bonus
            + velocity_bonus
            + movement_bonus
            + fastball_penalty
        )
        rows.append(
            {
                "game_pk": 100000 + game_slot,
                "game_date": base_date + timedelta(days=game_slot),
                "game_year": 2025,
                "at_bat_number": at_bat_slot % 12 + 1,
                "pitch_number": index % 5 + 1,
                "pitcher": 700001 + (index % 12),
                "batter": 800001 + (index % 18),
                "catcher_id": catcher_id,
                "pitch_type": pitch_type,
                "pitch_name": pitch_profile["name"],
                "stand": stand,
                "p_throws": p_throws,
                "balls": balls,
                "strikes": strikes,
                "outs_when_up": int(rng.integers(0, 3)),
                "on_1b": on_1b,
                "on_2b": on_2b,
                "on_3b": on_3b,
                "inning": int(rng.integers(1, 10)),
                "inning_topbot": "Top" if rng.random() > 0.5 else "Bot",
                "plate_x": plate_x,
                "plate_z": plate_z,
                "zone": int(np.clip(np.round(((plate_z - 1.2) / 2.6) * 9), 1, 14)),
                "sz_top": 3.45,
                "sz_bot": 1.55,
                "release_speed": float(rng.normal(pitch_profile["velo"], 0.7)),
                "release_spin": float(rng.normal(pitch_profile["spin"], 60.0)),
                "pfx_x": float(rng.normal(pitch_profile["pfx_x"], 0.12)),
                "pfx_z": float(rng.normal(pitch_profile["pfx_z"], 0.15)),
                "effective_speed": float(rng.normal(pitch_profile["velo"] - 1.5, 0.55)),
                "description": (
                    "swinging_strike"
                    if delta_run_exp < -0.04
                    else "called_strike"
                    if delta_run_exp < -0.015
                    else "foul"
                    if delta_run_exp < 0.012
                    else "ball"
                ),
                "events": "none",
                "estimated_woba_using_speedangle": float(max(0.0, rng.normal(0.29, 0.06))),
                "delta_run_exp": delta_run_exp,
            }
        )
    frame = pd.DataFrame(rows)
    frame["pitch_uid"] = make_pitch_uid(frame)
    ordered_columns = [
        "pitch_uid",
        "game_pk",
        "game_date",
        "game_year",
        "at_bat_number",
        "pitch_number",
        "pitcher",
        "batter",
        "catcher_id",
        "pitch_type",
        "pitch_name",
        "stand",
        "p_throws",
        "balls",
        "strikes",
        "outs_when_up",
        "on_1b",
        "on_2b",
        "on_3b",
        "inning",
        "inning_topbot",
        "plate_x",
        "plate_z",
        "zone",
        "sz_top",
        "sz_bot",
        "release_speed",
        "release_spin",
        "pfx_x",
        "pfx_z",
        "effective_speed",
        "description",
        "events",
        "estimated_woba_using_speedangle",
        "delta_run_exp",
    ]
    return frame[ordered_columns]
