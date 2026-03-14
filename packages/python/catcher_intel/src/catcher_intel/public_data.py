from __future__ import annotations

import io
from typing import Dict, Iterable, List, Optional, Sequence, Set

import pandas as pd
import requests
from pybaseball import playerid_reverse_lookup

from catcher_intel.db import read_dataframe

REQUEST_HEADERS = {
    "User-Agent": "catcher-intel/0.1 (+https://statsapi.mlb.com +https://baseballsavant.mlb.com)"
}
MLB_STATS_API = "https://statsapi.mlb.com/api/v1"
SAVANT_FRAMING_URL = (
    "https://baseballsavant.mlb.com/leaderboard/catcher-framing"
    "?type=catcher&seasonStart={season}&seasonEnd={season}&team=&min=q"
    "&sortColumn=rv_tot&sortDirection=desc&csv=true&download=true"
)
SAVANT_BLOCKING_URL = (
    "https://baseballsavant.mlb.com/leaderboard/catcher-blocking"
    "?season_start={season}&season_end={season}&game_type=Regular&tot_n=q"
    "&with_team_only=true&target_base=All&csv=true&download=true"
)
SAVANT_POPTIME_URL = (
    "https://baseballsavant.mlb.com/leaderboard/poptime"
    "?year={season}&team=&min2b=5&min3b=0&csv=true"
)
SAVANT_ARM_URL = (
    "https://baseballsavant.mlb.com/leaderboard/arm-strength"
    "?type=catcher&year={season}&minThrows=25&csv=true"
)


def _get_json(url: str, params: Optional[Dict[str, object]] = None) -> Dict[str, object]:
    response = requests.get(url, params=params, headers=REQUEST_HEADERS, timeout=60)
    response.raise_for_status()
    return response.json()


def _get_csv(url: str) -> pd.DataFrame:
    response = requests.get(url, headers=REQUEST_HEADERS, timeout=60)
    response.raise_for_status()
    return pd.read_csv(io.StringIO(response.text))


def _chunked(values: Sequence[int], chunk_size: int) -> Iterable[List[int]]:
    for start in range(0, len(values), chunk_size):
        yield list(values[start : start + chunk_size])


def mlb_headshot_url(player_id: int) -> str:
    return (
        "https://img.mlbstatic.com/mlb-photos/image/upload/"
        f"w_180,q_auto:best/v1/people/{player_id}/headshot/67/current"
    )


def fetch_teams(season: int) -> pd.DataFrame:
    payload = _get_json(
        f"{MLB_STATS_API}/teams",
        params={"sportId": 1, "season": season},
    )
    rows = []
    for team in payload.get("teams", []):
        rows.append(
            {
                "team_id": team.get("id"),
                "team_name": team.get("name"),
                "team_abbr": team.get("abbreviation"),
            }
        )
    return pd.DataFrame(rows)


def fetch_active_roster(season: int, teams: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for _, team in teams.iterrows():
        payload = _get_json(
            f"{MLB_STATS_API}/teams/{int(team['team_id'])}/roster",
            params={"rosterType": "active", "season": season, "hydrate": "person"},
        )
        for roster_entry in payload.get("roster", []):
            person = roster_entry.get("person", {})
            position = roster_entry.get("position", {})
            status = roster_entry.get("status", {})
            rows.append(
                {
                    "player_id": person.get("id"),
                    "team_id": team["team_id"],
                    "team_name": team["team_name"],
                    "team_abbr": team["team_abbr"],
                    "roster_position_code": position.get("code"),
                    "roster_position_name": position.get("name"),
                    "roster_position_abbr": position.get("abbreviation"),
                    "roster_status_code": status.get("code"),
                    "roster_status": status.get("description"),
                    "is_active_roster": True,
                }
            )
    if not rows:
        return pd.DataFrame(
            columns=[
                "player_id",
                "team_id",
                "team_name",
                "team_abbr",
                "roster_position_code",
                "roster_position_name",
                "roster_position_abbr",
                "roster_status_code",
                "roster_status",
                "is_active_roster",
            ]
        )
    return pd.DataFrame(rows).drop_duplicates(subset=["player_id"])


def fetch_people(player_ids: Sequence[int]) -> pd.DataFrame:
    rows = []
    for chunk in _chunked(list(player_ids), 50):
        payload = _get_json(
            f"{MLB_STATS_API}/people",
            params={"personIds": ",".join(str(player_id) for player_id in chunk)},
        )
        for person in payload.get("people", []):
            primary_position = person.get("primaryPosition", {})
            current_team = person.get("currentTeam", {})
            bat_side = person.get("batSide", {})
            pitch_hand = person.get("pitchHand", {})
            rows.append(
                {
                    "player_id": person.get("id"),
                    "full_name": person.get("fullName"),
                    "first_name": person.get("firstName"),
                    "last_name": person.get("lastName"),
                    "team_id_people": current_team.get("id"),
                    "team_name_people": current_team.get("name"),
                    "team_abbr_people": current_team.get("abbreviation"),
                    "primary_position_code": primary_position.get("code"),
                    "primary_position_name": primary_position.get("name"),
                    "primary_position_abbr": primary_position.get("abbreviation"),
                    "bats": bat_side.get("code"),
                    "throws": pitch_hand.get("code"),
                    "active_people": person.get("active"),
                }
            )
    return pd.DataFrame(rows)


def fetch_player_crosswalk(player_ids: Sequence[int]) -> pd.DataFrame:
    if not player_ids:
        return pd.DataFrame(
            columns=["player_id", "key_mlbam", "key_bbref", "key_fangraphs", "key_retro"]
        )

    rows: List[pd.DataFrame] = []
    for chunk in _chunked(list(player_ids), 200):
        lookup = playerid_reverse_lookup([str(player_id) for player_id in chunk], key_type="mlbam")
        if lookup is not None and not lookup.empty:
            rows.append(lookup)

    if not rows:
        return pd.DataFrame(
            columns=["player_id", "key_mlbam", "key_bbref", "key_fangraphs", "key_retro"]
        )

    frame = pd.concat(rows, ignore_index=True)
    if frame.empty:
        return pd.DataFrame(
            columns=["player_id", "key_mlbam", "key_bbref", "key_fangraphs", "key_retro"]
        )
    frame["player_id"] = pd.to_numeric(frame["key_mlbam"], errors="coerce").astype("Int64")
    return frame.rename(
        columns={
            "key_mlbam": "key_mlbam",
            "key_bbref": "key_bbref",
            "key_fangraphs": "key_fangraphs",
            "key_retro": "key_retro",
        }
    )[["player_id", "key_mlbam", "key_bbref", "key_fangraphs", "key_retro"]]


def load_distinct_players(database_url: str, season: int) -> pd.DataFrame:
    return read_dataframe(
        """
        SELECT DISTINCT player_id, player_role
        FROM (
            SELECT pitcher AS player_id, 'pitcher' AS player_role
            FROM pitches_raw
            WHERE game_year = :season
            UNION ALL
            SELECT batter AS player_id, 'batter' AS player_role
            FROM pitches_raw
            WHERE game_year = :season
            UNION ALL
            SELECT catcher_id AS player_id, 'catcher' AS player_role
            FROM pitches_raw
            WHERE game_year = :season
              AND catcher_id IS NOT NULL
        ) players
        WHERE player_id IS NOT NULL
        """,
        database_url,
        params={"season": season},
    )


def build_player_metadata_frame(database_url: str, season: int) -> pd.DataFrame:
    teams = fetch_teams(season)
    active_roster = fetch_active_roster(season, teams)
    distinct_players = load_distinct_players(database_url, season)
    player_ids: Set[int] = set(pd.to_numeric(distinct_players["player_id"], errors="coerce").dropna().astype(int))
    player_ids.update(pd.to_numeric(active_roster.get("player_id"), errors="coerce").dropna().astype(int))
    if not player_ids:
        return pd.DataFrame()

    people = fetch_people(sorted(player_ids))
    if people.empty:
        return pd.DataFrame()

    catcher_ids = set(
        pd.to_numeric(
            distinct_players.loc[distinct_players["player_role"] == "catcher", "player_id"],
            errors="coerce",
        )
        .dropna()
        .astype(int)
    )
    metadata = people.merge(active_roster, on="player_id", how="left")
    metadata["season"] = season
    metadata["team_id"] = metadata["team_id"].fillna(metadata["team_id_people"])
    metadata["team_name"] = metadata["team_name"].fillna(metadata["team_name_people"])
    metadata["team_abbr"] = metadata["team_abbr"].fillna(metadata["team_abbr_people"])
    metadata["active"] = metadata["is_active_roster"].fillna(False) | metadata["active_people"].fillna(False)
    metadata["is_catcher"] = (
        metadata["primary_position_abbr"].eq("C")
        | metadata["roster_position_abbr"].eq("C")
        | metadata["player_id"].isin(catcher_ids)
    )
    metadata["is_selectable"] = metadata["is_catcher"] & (
        metadata["player_id"].isin(catcher_ids) | metadata["is_active_roster"].fillna(False)
    )
    metadata["headshot_url"] = metadata["player_id"].map(mlb_headshot_url)
    metadata["dropdown_label"] = metadata.apply(
        lambda row: " | ".join(
            [
                str(row["full_name"]),
                str(row["team_abbr"] if pd.notna(row["team_abbr"]) else "FA"),
                str(season),
            ]
        ),
        axis=1,
    )
    metadata = metadata.drop_duplicates(subset=["player_id"])
    keep_columns = [
        "player_id",
        "season",
        "full_name",
        "first_name",
        "last_name",
        "team_id",
        "team_name",
        "team_abbr",
        "primary_position_code",
        "primary_position_name",
        "primary_position_abbr",
        "bats",
        "throws",
        "active",
        "is_catcher",
        "is_selectable",
        "headshot_url",
        "dropdown_label",
    ]
    return metadata[keep_columns].sort_values(["is_selectable", "full_name"], ascending=[False, True])


def fetch_catcher_public_metrics(season: int) -> pd.DataFrame:
    teams = fetch_teams(season)
    team_lookup = {
        int(row["team_id"]): row["team_abbr"]
        for _, row in teams.dropna(subset=["team_id"]).iterrows()
    }

    framing = _get_csv(SAVANT_FRAMING_URL.format(season=season)).rename(
        columns={
            "id": "catcher_id",
            "pitches": "framing_pitches",
            "rv_tot": "framing_runs",
            "pct_tot": "framing_strike_rate",
        }
    )
    framing["season"] = season

    blocking = _get_csv(SAVANT_BLOCKING_URL.format(season=season)).rename(
        columns={
            "player_id": "catcher_id",
            "pitches": "blocking_pitches",
            "catcher_blocking_runs": "blocking_runs",
            "blocks_above_average": "blocks_above_average",
            "x_pbwp": "expected_pbwp",
        }
    )
    blocking["season"] = season

    poptime = _get_csv(SAVANT_POPTIME_URL.format(season=season)).rename(
        columns={
            "entity_id": "catcher_id",
            "team_id": "team_id",
            "pop_2b_sba_count": "pop_2b_attempts",
            "pop_2b_sba": "pop_time_2b",
            "pop_2b_cs": "pop_time_2b_cs",
            "pop_2b_sb": "pop_time_2b_sb",
            "pop_3b_sba": "pop_time_3b",
            "exchange_2b_3b_sba": "exchange_time",
            "maxeff_arm_2b_3b_sba": "max_effective_arm",
        }
    )
    poptime["season"] = season
    poptime["team_abbr"] = poptime["team_id"].map(team_lookup)

    arm = _get_csv(SAVANT_ARM_URL.format(season=season)).rename(
        columns={
            "player_id": "catcher_id",
            "total_throws": "total_throws",
            "max_arm_strength": "max_arm_strength",
            "arm_overall": "arm_overall",
        }
    )
    if "primary_position" in arm.columns:
        arm = arm[pd.to_numeric(arm["primary_position"], errors="coerce") == 2].copy()
    arm["season"] = season

    merged = framing[
        ["catcher_id", "season", "framing_pitches", "framing_runs", "framing_strike_rate"]
    ].merge(
        blocking[
            [
                "catcher_id",
                "season",
                "team_name",
                "blocking_pitches",
                "blocking_runs",
                "blocks_above_average",
                "expected_pbwp",
            ]
        ],
        on=["catcher_id", "season"],
        how="outer",
    )
    merged = merged.merge(
        poptime[
            [
                "catcher_id",
                "season",
                "team_id",
                "team_abbr",
                "pop_time_2b",
                "pop_time_2b_cs",
                "pop_time_2b_sb",
                "pop_time_3b",
                "exchange_time",
                "max_effective_arm",
                "pop_2b_attempts",
            ]
        ],
        on=["catcher_id", "season"],
        how="outer",
    )
    merged = merged.merge(
        arm[
            [
                "catcher_id",
                "season",
                "team_name",
                "arm_overall",
                "max_arm_strength",
                "total_throws",
            ]
        ].rename(columns={"team_name": "arm_team_name"}),
        on=["catcher_id", "season"],
        how="outer",
    )
    merged["team_name"] = merged["team_name"].fillna(merged["arm_team_name"])
    merged["source_note"] = (
        "Framing, blocking, pop time, and arm strength sourced from public Baseball Savant leaderboards."
    )
    keep_columns = [
        "catcher_id",
        "season",
        "team_id",
        "team_name",
        "team_abbr",
        "framing_pitches",
        "framing_runs",
        "framing_strike_rate",
        "blocking_pitches",
        "blocking_runs",
        "blocks_above_average",
        "expected_pbwp",
        "pop_time_2b",
        "pop_time_2b_cs",
        "pop_time_2b_sb",
        "pop_time_3b",
        "exchange_time",
        "max_effective_arm",
        "pop_2b_attempts",
        "arm_overall",
        "max_arm_strength",
        "total_throws",
        "source_note",
    ]
    return merged[keep_columns].drop_duplicates(subset=["catcher_id", "season"])
