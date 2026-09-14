# backstop.ai

A catcher intelligence workspace with Live, Scouting, Compare, Game, and Research views. Preserve the existing dark desktop sidebar, main canvas, context rail, responsive navigation, player photos, and working route behavior when extending a feature.

## Live catcher heatmaps

Purpose: let a user compare where each catcher received pitches against right- and left-handed batters in the selected MLB game. Show paired smooth blue-to-red concentration maps with the strike zone, home plate, and batting-side orientation. Allow catcher selection and an all-pitches or swinging-strikes filter. The reference is the user-supplied Hunter Goodman pitch heatmap; integrate its chart concept into the existing dark app, rather than replacing the shell.

Use real MLB pitch locations, actual plate-appearance batting side, and chronological catcher substitutions. Show coverage, unknown attribution, empty states, and small samples. Use a shared density scale across both handedness panels. Do not describe concentration as effectiveness or the single-game sample as season data. Keep the existing team-wide batter hot-zone grade separately labeled.

The public frontend supports direct MLB data. Historical views can use clearly labeled demo snapshots; a deployed FastAPI/Postgres backend and AI analyst credentials are separate capabilities and must not be inferred from a successful frontend build.
