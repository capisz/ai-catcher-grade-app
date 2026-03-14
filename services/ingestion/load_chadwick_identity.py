from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable, List

import pandas as pd

from catcher_intel.db import ensure_schema, upsert_dataframe

PEOPLE_COLUMNS = [
    "key_person",
    "key_uuid",
    "key_mlbam",
    "key_retro",
    "key_bbref",
    "key_bbref_minors",
    "key_fangraphs",
    "key_npb",
    "key_wikidata",
    "name_last",
    "name_first",
    "name_given",
    "name_suffix",
    "name_matrilineal",
    "name_nick",
    "birth_year",
    "birth_month",
    "birth_day",
    "pro_played_first",
    "pro_played_last",
    "mlb_played_first",
    "mlb_played_last",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Load Chadwick Register player identity data from people-*.csv shards."
    )
    parser.add_argument("--db-url", required=True, help="Postgres SQLAlchemy URL")
    parser.add_argument(
        "--register-dir",
        default="data/external/register",
        help="Path to the local Chadwick Register clone",
    )
    return parser.parse_args()


def find_people_shards(register_dir: str) -> List[Path]:
    data_dir = Path(register_dir) / "data"
    shards = sorted(data_dir.glob("people-*.csv"))
    if not shards:
        raise FileNotFoundError(f"No Chadwick people shards found under {data_dir}")
    return shards


def load_people_shards(shards: Iterable[Path]) -> pd.DataFrame:
    frames = [
        pd.read_csv(
            shard,
            dtype="string",
            usecols=PEOPLE_COLUMNS,
            keep_default_na=True,
            na_values=["", "NULL", "None"],
        )
        for shard in shards
    ]
    if not frames:
        return pd.DataFrame(columns=PEOPLE_COLUMNS)
    return pd.concat(frames, ignore_index=True)


def normalize_people_frame(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return frame

    normalized = frame.copy()
    normalized["key_mlbam"] = pd.to_numeric(normalized["key_mlbam"], errors="coerce").astype("Int64")
    normalized = normalized[normalized["key_mlbam"].notna()].copy()
    if normalized.empty:
        return normalized

    for column in [
        "birth_year",
        "birth_month",
        "birth_day",
        "pro_played_first",
        "pro_played_last",
        "mlb_played_first",
        "mlb_played_last",
    ]:
        normalized[column] = pd.to_numeric(normalized[column], errors="coerce").astype("Int64")

    normalized["full_name"] = normalized.apply(build_full_name, axis=1)
    normalized["full_name"] = normalized["full_name"].fillna("").str.strip()
    normalized = normalized[normalized["full_name"] != ""].copy()
    normalized["updated_at"] = pd.Timestamp.utcnow().tz_localize(None)

    normalized = normalized.sort_values(
        ["key_mlbam", "mlb_played_last", "pro_played_last", "key_person"],
        ascending=[True, False, False, True],
        na_position="last",
    )
    normalized = normalized.drop_duplicates(subset=["key_person"], keep="first")
    normalized = normalized.drop_duplicates(subset=["key_mlbam"], keep="first")

    output_columns = [
        "key_person",
        "key_uuid",
        "key_mlbam",
        "key_retro",
        "key_bbref",
        "key_bbref_minors",
        "key_fangraphs",
        "key_npb",
        "key_wikidata",
        "name_first",
        "name_last",
        "name_given",
        "name_suffix",
        "name_matrilineal",
        "name_nick",
        "full_name",
        "birth_year",
        "birth_month",
        "birth_day",
        "pro_played_first",
        "pro_played_last",
        "mlb_played_first",
        "mlb_played_last",
        "updated_at",
    ]
    return normalized[output_columns]


def build_full_name(row: pd.Series) -> str:
    given_name = clean_text(row.get("name_given")) or clean_text(row.get("name_first"))
    last_name_parts = [
        clean_text(row.get("name_matrilineal")),
        clean_text(row.get("name_last")),
    ]
    full_name_parts = [
        given_name,
        " ".join(part for part in last_name_parts if part),
        clean_text(row.get("name_suffix")),
    ]
    return " ".join(part for part in full_name_parts if part).strip()


def clean_text(value: object) -> str:
    if value is None or pd.isna(value):
        return ""
    return str(value).strip()


def main() -> None:
    args = parse_args()
    ensure_schema(args.db_url)

    shards = find_people_shards(args.register_dir)
    frame = load_people_shards(shards)
    normalized = normalize_people_frame(frame)
    rows_written = upsert_dataframe(
        normalized,
        "player_identity",
        ["key_person"],
        args.db_url,
    )

    print(f"People shards scanned: {len(shards):,}")
    print(f"Rows loaded from CSV: {len(frame):,}")
    print(f"Rows written to player_identity: {rows_written:,}")
    print(f"Distinct MLBAM identities retained: {normalized['key_mlbam'].nunique():,}")


if __name__ == "__main__":
    main()
