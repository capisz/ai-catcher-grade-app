// Read-only integration check using the final game from the recorded fixture.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const web = fileURLToPath(new URL('../', import.meta.url));
const directory = fs.mkdtempSync(path.join(web, '.live-check-'));
try {
  for (const name of ['live-game-context', 'catcher-locations', 'live-mlb']) {
    const source = fs.readFileSync(path.join(web, 'src/lib', name + '.ts'), 'utf8');
    fs.writeFileSync(path.join(directory, name + '.js'), ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  const { liveGamePitches, handleLiveFallback } = require(path.join(directory, 'live-mlb.js'));
  const { NextRequest } = require('next/server');
  const backend = await fetch('http://localhost:3000/api/backend/live/games/824631/pitches?limit=1000').then(r => { assert.equal(r.status, 200); return r.json(); });
  const fallback = await liveGamePitches('824631', 1000);
  assert.deepEqual(fallback.context, backend.context);
  assert.equal(fallback.pitch_count, backend.pitch_count);
  const schedule = await handleLiveFallback(new NextRequest('http://localhost/api/backend/live/schedule?date=2026-09-11'), ['live','schedule']);
  assert.equal(schedule.status, 200);
  const payload = await schedule.json();
  assert.equal(payload.date, '2026-09-11');
  assert.ok(payload.games.length > 0);
  console.log('PASS live MLB: backend/frontend scoreboard parity, pitch counts, and date schedule');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
