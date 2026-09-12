# Live MLB game context

Live mode reads MLB's public Stats API directly. Historical Scouting, Compare,
Game, and Research remain separate and continue to use the labeled demo database.

Reference reviewed: https://github.com/nuotsu/mlb at commit
`f9ce8155058a94222ef3ad1446f4001973eae1a4`, especially its date-based schedule and
inning scoreboard. No code or assets were copied; this app projects the same
public MLB game-feed fields into its existing Next.js/FastAPI structure.

The `/live/games/{game_pk}/pitches` response now includes `context`: inning scores,
R/H/E totals, reported battery and batter, count/outs, base runners, probable
pitchers, decisions, weather, and five recent completed plate appearances.
Both FastAPI and the frontend-only fallback return the same shape.

The dashboard checks the selected game every 20 seconds after each request
completes and the schedule every minute. Upstream caches can delay changes;
"Checked" means a successful fetch, not the time MLB recorded a play. Failed
refreshes keep the last successful game context with an explicit stale notice.
Game changes abort old requests, and responses are keyed to the selected game.

Dates use America/New_York consistently. On first opening, if the selected day
has no live or completed games, the previous day's slate is offered when it has
one. The date field shows that date; games from different dates are not combined.
The previous/next/today controls also work for days without scheduled games.

Missing stats remain unknown rather than zero. Final games display pitching
decisions rather than an active count or runners. `X` means the home half inning
was not played in a completed home win. The zone-avoidance score remains a
team-wide, season-relative heuristic, not an individual catcher grade or a
historically frozen pregame model. It cannot infer who requested a pitch.

Validation:

```sh
.venv/bin/python -m unittest discover -s tests -v
pnpm --filter web exec node scripts/test-live-context.mjs
```

The latter checks Eastern-date behavior and Python/frontend projection parity
for final, missing-data, and changed-baserunner cases. The fixture is a reduced
public MLB game feed for game 824631, retrieved during local validation.
