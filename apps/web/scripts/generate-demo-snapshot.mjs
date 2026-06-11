#!/usr/bin/env node
/**
 * Build-time demo snapshot generator.
 *
 * Hits the FastAPI summary endpoints for the latest scored season and writes
 * a single JSON snapshot to apps/web/src/demo/snapshot.json. In production,
 * the web data layer serves this snapshot (with a "Demo data" badge) when the
 * backend is unreachable or unconfigured.
 *
 * Usage:
 *   node scripts/generate-demo-snapshot.mjs            # uses API_BASE_URL or http://127.0.0.1:8000
 *   SNAPSHOT_API_URL=http://127.0.0.1:8765 node scripts/generate-demo-snapshot.mjs
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const API_BASE = (
  process.env.SNAPSHOT_API_URL ??
  process.env.API_BASE_URL ??
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

const MAX_CATCHERS = 12;

async function fetchJson(pathname) {
  const url = `${API_BASE}${pathname}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status}`);
  }
  return response.json();
}

async function main() {
  const metadata = await fetchJson("/app/metadata");
  const season = metadata.selected_season;
  if (!season) {
    throw new Error("No scored season available from /app/metadata.");
  }

  const leaderboard = await fetchJson(
    `/catchers/leaderboard?season=${season}&min_pitches=50`,
  );
  const catchers = await fetchJson(`/catchers?season=${season}`);

  const snapshotIds = leaderboard.leaderboard
    .slice(0, MAX_CATCHERS)
    .map((row) => row.catcher_id);
  if (snapshotIds.length === 0 && catchers.catchers.length > 0) {
    snapshotIds.push(catchers.catchers[0].catcher_id);
  }

  // Keep the catcher dropdown consistent with the per-catcher payloads we
  // actually snapshot, so every selectable row resolves in demo mode.
  const snapshotIdSet = new Set(snapshotIds);
  const filteredCatchers = {
    ...catchers,
    catchers: catchers.catchers.filter((row) => snapshotIdSet.has(row.catcher_id)),
  };

  const details = {};
  const pairings = {};
  const counts = {};
  const pitchTypes = {};
  const locationSummaries = {};

  for (const catcherId of snapshotIds) {
    console.log(`Snapshotting catcher ${catcherId}...`);
    details[catcherId] = await fetchJson(`/catchers/${catcherId}?season=${season}`);
    pairings[catcherId] = await fetchJson(`/catchers/${catcherId}/pairings?season=${season}`);
    counts[catcherId] = await fetchJson(`/catchers/${catcherId}/counts?season=${season}`);
    pitchTypes[catcherId] = await fetchJson(`/catchers/${catcherId}/pitch-types?season=${season}`);
    locationSummaries[catcherId] = await fetchJson(
      `/catchers/${catcherId}/location-summary?season=${season}`,
    );
  }

  const snapshot = {
    generatedAt: new Date().toISOString(),
    season,
    health: { status: "ok" },
    metadata,
    catchers: filteredCatchers,
    leaderboard,
    details,
    pairings,
    counts,
    pitchTypes,
    locationSummaries,
  };

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(scriptDir, "..", "src", "demo", "snapshot.json");
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `Wrote ${outPath} (season ${season}, ${snapshotIds.length} catchers, from ${API_BASE}).`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
