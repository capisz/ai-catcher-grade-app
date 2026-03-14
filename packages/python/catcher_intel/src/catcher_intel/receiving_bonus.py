from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ReceivingBonus:
    catcher_id: int
    value: float = 0.0
    note: str = "Receiving Bonus placeholder. Framing value is not yet modeled."


def placeholder_bonus(catcher_id: int) -> ReceivingBonus:
    return ReceivingBonus(catcher_id=catcher_id)

