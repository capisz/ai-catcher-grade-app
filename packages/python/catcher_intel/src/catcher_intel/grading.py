from __future__ import annotations

import json
from typing import Dict, List, Optional, Sequence

import numpy as np
import pandas as pd

GRADE_SPECS = {
    "overall_game_calling": [
        {"name": "avg_dva", "column": "avg_dva", "weight": 0.45},
        {"name": "outperform", "column": "outperform_rate", "weight": 0.2},
        {"name": "leverage", "column": "hitter_friendly_avg_dva", "weight": 0.2},
        {"name": "putaway", "column": "putaway_avg_dva", "weight": 0.15},
    ],
    "count_leverage": [
        {"name": "leverage_dva", "column": "hitter_friendly_avg_dva", "weight": 0.65},
        {
            "name": "leverage_outperform",
            "column": "hitter_friendly_outperform_rate",
            "weight": 0.35,
        },
    ],
    "putaway_count": [
        {"name": "putaway_dva", "column": "putaway_avg_dva", "weight": 0.7},
        {"name": "putaway_outperform", "column": "putaway_outperform_rate", "weight": 0.3},
    ],
    "damage_avoidance": [
        {
            "name": "damage_expected_rv",
            "column": "damage_avoidance_expected_rv_actual",
            "weight": 0.55,
            "higher_is_better": False,
        },
        {"name": "damage_dva", "column": "damage_avoidance_avg_dva", "weight": 0.45},
    ],
    "pitch_mix_synergy": [
        {"name": "family_alignment", "column": "count_family_alignment_rate", "weight": 0.4},
        {"name": "pairing_dva", "column": "pairing_avg_dva", "weight": 0.4},
        {
            "name": "pairing_outperform",
            "column": "pairing_outperform_rate",
            "weight": 0.2,
        },
    ],
    "receiving_support": [
        {"name": "framing", "column": "framing_runs", "weight": 0.4},
        {"name": "blocking", "column": "blocking_runs", "weight": 0.25},
        {"name": "arm", "column": "arm_overall", "weight": 0.2},
        {"name": "pop", "column": "pop_time_2b", "weight": 0.15, "higher_is_better": False},
    ],
}

GRADE_DESCRIPTIONS = {
    "overall_game_calling": (
        "45% avg DVA, 20% baseline outperformance rate, 20% hitter-friendly count DVA, "
        "15% put-away count DVA."
    ),
    "count_leverage": "65% hitter-friendly count DVA, 35% hitter-friendly outperformance rate.",
    "putaway_count": "70% put-away count DVA, 30% put-away outperformance rate.",
    "damage_avoidance": (
        "55% lower-is-better expected run value in damage counts, 45% damage-count DVA."
    ),
    "pitch_mix_synergy": (
        "40% count-family alignment rate, 40% pitcher-pairing avg DVA, "
        "20% pitcher-pairing outperformance rate."
    ),
    "receiving_support": (
        "40% public framing runs, 25% blocking runs, 20% arm overall, "
        "15% lower-is-better pop time to second."
    ),
}

GRADE_REQUIREMENTS = {
    "overall_game_calling": {"min_pitches": 500, "min_games": 20},
    "count_leverage": {
        "min_pitches": 500,
        "min_games": 20,
        "min_split_pitches_column": "hitter_friendly_pitches",
        "min_split_pitches": 120,
    },
    "putaway_count": {
        "min_pitches": 500,
        "min_games": 20,
        "min_split_pitches_column": "putaway_pitches",
        "min_split_pitches": 120,
    },
    "damage_avoidance": {
        "min_pitches": 500,
        "min_games": 20,
        "min_split_pitches_column": "damage_count_pitches",
        "min_split_pitches": 80,
    },
    "pitch_mix_synergy": {"min_pitches": 500, "min_games": 20},
    "receiving_support": {"min_pitches": 300, "min_games": 10, "min_public_metrics": 1},
}

RECEIVING_COLUMNS = ["framing_runs", "blocking_runs", "arm_overall", "pop_time_2b"]
MIN_QUALIFIED_POPULATION = 8


def score_20_80(percentile: float) -> float:
    return round(20 + max(0.0, min(1.0, percentile)) * 60, 1)


def grade_label(score: float) -> str:
    if score >= 70:
        return "Elite"
    if score >= 60:
        return "Plus"
    if score >= 50:
        return "Solid"
    if score >= 40:
        return "Average"
    if score >= 30:
        return "Fringe"
    return "Poor"


def _numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _safe_int(value: object) -> int:
    numeric = pd.to_numeric(value, errors="coerce")
    if pd.isna(numeric):
        return 0
    return int(numeric)


def empirical_percentile(
    value: object,
    population: pd.Series,
    higher_is_better: bool = True,
) -> Optional[float]:
    if pd.isna(value):
        return None

    numeric_population = _numeric(population).dropna()
    if numeric_population.empty:
        return None

    if not higher_is_better:
        return empirical_percentile(-float(value), -numeric_population, higher_is_better=True)

    ordered = np.sort(numeric_population.to_numpy(dtype=float))
    left = np.searchsorted(ordered, float(value), side="left")
    right = np.searchsorted(ordered, float(value), side="right")
    return float(((left / len(ordered)) + (right / len(ordered))) / 2)


def _weighted_percentile_for_row(
    row: pd.Series,
    population: pd.DataFrame,
    specs: Sequence[Dict[str, object]],
) -> tuple[Optional[float], Dict[str, Optional[float]]]:
    weighted_sum = 0.0
    active_weight_sum = 0.0
    component_percentiles: Dict[str, Optional[float]] = {}

    for spec in specs:
        name = str(spec["name"])
        column = str(spec["column"])
        percentile = empirical_percentile(
            row.get(column),
            population[column],
            higher_is_better=bool(spec.get("higher_is_better", True)),
        )
        component_percentiles[name] = percentile
        if percentile is None:
            continue
        weight = float(spec["weight"])
        weighted_sum += percentile * weight
        active_weight_sum += weight

    if active_weight_sum == 0:
        return None, component_percentiles
    return weighted_sum / active_weight_sum, component_percentiles


def _qualification_mask(frame: pd.DataFrame, grade_name: str) -> pd.Series:
    requirements = GRADE_REQUIREMENTS[grade_name]
    mask = frame["pitches"].fillna(0).ge(int(requirements["min_pitches"]))
    mask &= frame["games_scored"].fillna(0).ge(int(requirements["min_games"]))

    split_column = requirements.get("min_split_pitches_column")
    if split_column:
        mask &= frame[str(split_column)].fillna(0).ge(int(requirements["min_split_pitches"]))

    if grade_name == "receiving_support":
        mask &= frame[RECEIVING_COLUMNS].notna().sum(axis=1).ge(int(requirements["min_public_metrics"]))
    elif grade_name == "pitch_mix_synergy":
        mask &= frame["count_family_alignment_rate"].notna()
        mask &= frame["pairing_avg_dva"].notna()

    return mask


def _stability_note(
    row: pd.Series,
    grade_name: str,
    population_size: int,
    qualified: bool,
) -> str:
    requirements = GRADE_REQUIREMENTS[grade_name]
    deficits: List[str] = []
    total_pitches = _safe_int(row.get("pitches"))
    games_scored = _safe_int(row.get("games_scored"))
    if total_pitches < int(requirements["min_pitches"]):
        deficits.append(f"{total_pitches} pitches (< {requirements['min_pitches']})")
    if games_scored < int(requirements["min_games"]):
        deficits.append(f"{games_scored} games (< {requirements['min_games']})")

    split_column = requirements.get("min_split_pitches_column")
    if split_column:
        split_pitches = _safe_int(row.get(str(split_column)))
        split_minimum = int(requirements["min_split_pitches"])
        if split_pitches < split_minimum:
            deficits.append(f"{split_pitches} {str(split_column).replace('_', ' ')} (< {split_minimum})")

    if grade_name == "receiving_support":
        available_public_metrics = int(row[RECEIVING_COLUMNS].notna().sum())
        if available_public_metrics < int(requirements["min_public_metrics"]):
            deficits.append("missing public receiving metrics")

    if population_size < MIN_QUALIFIED_POPULATION:
        return (
            f"Insufficient qualified catcher population for stable normalization "
            f"({population_size} qualified catchers)."
        )

    if qualified:
        return (
            f"Normalized against {population_size} qualified catchers for the season. "
            f"Sample is stable for this grade."
        )

    if deficits:
        return (
            "Low-sample or incomplete grade. "
            f"Compared to {population_size} qualified catchers, but stability is limited because: "
            + "; ".join(deficits)
            + "."
        )

    return f"Compared to {population_size} qualified catchers, but sample stability is limited."


def build_grade_outputs(
    season_summary: pd.DataFrame,
    public_metrics: pd.DataFrame,
) -> pd.DataFrame:
    if season_summary.empty:
        return pd.DataFrame()

    merged = season_summary.merge(
        public_metrics,
        left_on=["catcher_id", "season"],
        right_on=["catcher_id", "season"],
        how="left",
    )
    merged["count_family_alignment_rate"] = merged["count_family_alignment_rate"].fillna(0.5)
    merged["pairing_avg_dva"] = merged["pairing_avg_dva"].fillna(merged["avg_dva"])
    merged["pairing_outperform_rate"] = merged["pairing_outperform_rate"].fillna(
        merged["outperform_rate"]
    )

    rows: List[Dict[str, object]] = []
    for _, row in merged.iterrows():
        row_dict: Dict[str, object] = {
            "catcher_id": int(row["catcher_id"]),
            "season": int(row["season"]),
        }
        formula_notes: Dict[str, object] = {}

        for grade_name, specs in GRADE_SPECS.items():
            qualified_mask = _qualification_mask(merged, grade_name)
            population = merged[qualified_mask].copy()
            population_size = int(len(population))
            qualified = bool(qualified_mask.loc[row.name])

            percentile: Optional[float] = None
            component_percentiles: Dict[str, Optional[float]] = {}
            if population_size >= MIN_QUALIFIED_POPULATION:
                percentile, component_percentiles = _weighted_percentile_for_row(row, population, specs)

            if percentile is None:
                score = None
                label = None
            else:
                score = score_20_80(percentile)
                label = grade_label(score)

            stability_note = _stability_note(
                row=row,
                grade_name=grade_name,
                population_size=population_size,
                qualified=qualified,
            )

            row_dict[f"{grade_name}_score"] = score
            row_dict[f"{grade_name}_label"] = label
            formula_notes[grade_name] = {
                "scale": "20-80",
                "normalization": "Percentile rank against qualified catchers in the selected season.",
                "description": GRADE_DESCRIPTIONS[grade_name],
                "weights": {str(spec["name"]): float(spec["weight"]) for spec in specs},
                "thresholds": GRADE_REQUIREMENTS[grade_name],
                "qualified": qualified,
                "population_size": population_size,
                "stability_note": stability_note,
                "inputs": {
                    str(spec["name"]): (
                        None
                        if pd.isna(row[str(spec["column"])])
                        else round(float(row[str(spec["column"])]), 6)
                    )
                    for spec in specs
                },
                "component_percentiles": {
                    name: None if value is None else round(float(value), 6)
                    for name, value in component_percentiles.items()
                },
            }

        row_dict["formula_notes"] = json.dumps(formula_notes, sort_keys=True)
        rows.append(row_dict)

    return pd.DataFrame(rows)
