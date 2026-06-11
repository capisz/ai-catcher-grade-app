"""Tests for the 20-80 grading scale and label mapping.

These are domain-agnostic property tests: they hold whether
``score_20_80`` expects percentiles on a 0-1 or 0-100 scale, so they
won't break if the input convention changes.
"""

from __future__ import annotations

import pytest

from catcher_intel.grading import grade_label, score_20_80


@pytest.mark.parametrize("domain", [[0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0],
                                    [0.0, 10.0, 25.0, 50.0, 75.0, 90.0, 100.0]])
def test_score_20_80_stays_on_scouting_scale(domain):
    for percentile in domain:
        score = score_20_80(percentile)
        assert 20.0 <= score <= 80.0, f"score {score} for percentile {percentile} left the 20-80 scale"


@pytest.mark.parametrize("domain", [[0.0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0],
                                    [0.0, 10.0, 25.0, 50.0, 75.0, 90.0, 100.0]])
def test_score_20_80_is_monotonic_nondecreasing(domain):
    scores = [score_20_80(p) for p in domain]
    assert scores == sorted(scores), f"scores not monotonic over {domain}: {scores}"


def test_score_20_80_extremes_span_the_scale():
    low = min(score_20_80(0.0), score_20_80(0))
    high = max(score_20_80(1.0), score_20_80(100.0))
    assert low == pytest.approx(20.0, abs=1.0)
    assert high == pytest.approx(80.0, abs=1.0)


def test_grade_label_returns_nonempty_string_across_scale():
    seen = set()
    for score in range(20, 81, 5):
        label = grade_label(float(score))
        assert isinstance(label, str) and label.strip(), f"empty label for {score}"
        seen.add(label)
    # The 20-80 scale should map to more than one qualitative bucket.
    assert len(seen) >= 3, f"expected multiple grade buckets, got {seen}"


def test_grade_label_ordering_is_consistent():
    # The same label set should be produced for equal scores (pure function).
    assert grade_label(50.0) == grade_label(50.0)
    assert grade_label(20.0) == grade_label(20.0)
    assert grade_label(80.0) == grade_label(80.0)
