import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const source = fs.readFileSync(new URL("../src/lib/live-game-context.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { buildGameContext, mlbDate, shiftDate } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const fixture = JSON.parse(fs.readFileSync(new URL("tests/fixtures/mlb-game.json", root), "utf8"));

assert.equal(mlbDate(new Date("2026-09-12T02:00:00Z")), "2026-09-11");
assert.equal(shiftDate("2026-03-09", -1), "2026-03-08");
assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
const context = buildGameContext(fixture);
assert.equal(context.teams.home.runs, 12);
assert.equal(context.innings.at(-1).home, null);
assert.equal(context.decisions.winner.name, "Shota Imanaga");
assert.equal(buildGameContext({}).teams.home.runs, null);

// The same source feed must render identically with and without FastAPI.
for (const feed of [fixture, {}, { ...fixture, liveData: {} }, {
  ...fixture, liveData: { ...fixture.liveData, linescore: { ...fixture.liveData.linescore,
    offense: { first: { id: 123, fullName: "Test Runner" }, batter: { id: 124, fullName: "Next Batter" } },
  } },
}]) {
  const python = execFileSync(fileURLToPath(new URL(".venv/bin/python", root)), ["-c", "import sys,json; from catcher_intel.live_context import game_context; print(json.dumps(game_context(json.load(sys.stdin))))"], { input: JSON.stringify(feed), encoding: "utf8" });
  assert.deepEqual(buildGameContext(feed), JSON.parse(python));
}
console.log("PASS MLB feed mapping, missing data, Eastern dates, and Python/frontend parity");
