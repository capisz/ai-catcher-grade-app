import { cache } from "react";

import snapshot from "@/demo/snapshot.json";

/**
 * Build-time demo snapshot fallback.
 *
 * snapshot.json is produced by `node scripts/generate-demo-snapshot.mjs`
 * against a scored FastAPI instance. In production, when the backend is
 * unreachable or unconfigured (network error / 503), the data layer serves
 * these payloads instead of rendering the offline error page, and pages show
 * a "Demo data" badge.
 */

type KeyedPayloads = Record<string, unknown>;

const demoSnapshot = snapshot as {
  generatedAt: string;
  season: number;
  health: unknown;
  metadata: unknown;
  catchers: unknown;
  leaderboard: unknown;
  details: KeyedPayloads;
  pairings: KeyedPayloads;
  counts: KeyedPayloads;
  pitchTypes: KeyedPayloads;
  locationSummaries: KeyedPayloads;
  compare: unknown;
  recommendation: unknown;
};

// Per-request flag (React request-scoped cache) so server components rendered
// after a demo-served fetch can show the badge without cross-request leakage.
const demoState = cache(() => ({ active: false }));

export function markDemoDataServed() {
  demoState().active = true;
}

export function isDemoDataActive() {
  return demoState().active;
}

export function getDemoSnapshotSeason() {
  return demoSnapshot.season;
}

const CATCHER_SUBRESOURCES: Record<string, KeyedPayloads> = {
  pairings: demoSnapshot.pairings,
  counts: demoSnapshot.counts,
  "pitch-types": demoSnapshot.pitchTypes,
  "location-summary": demoSnapshot.locationSummaries,
};

/**
 * Resolve an API path (as passed to fetchJson, query string included) to a
 * demo payload. Query params are intentionally ignored: the snapshot is a
 * single-season capture, which is exactly what the demo badge communicates.
 */
export function getDemoResponse(path: string): unknown {
  const pathname = path.split("?")[0] ?? "";

  if (pathname === "/health") {
    return demoSnapshot.health;
  }
  if (pathname === "/app/metadata") {
    return demoSnapshot.metadata;
  }
  if (pathname === "/catchers") {
    return demoSnapshot.catchers;
  }
  if (pathname === "/catchers/leaderboard") {
    return demoSnapshot.leaderboard;
  }
  if (pathname === "/catchers/compare") {
    return demoSnapshot.compare ?? undefined;
  }
  if (pathname === "/atbat/recommendation") {
    return demoSnapshot.recommendation ?? undefined;
  }

  const detailMatch = pathname.match(/^\/catchers\/(\d+)$/);
  if (detailMatch) {
    return demoSnapshot.details[detailMatch[1]];
  }

  const subresourceMatch = pathname.match(/^\/catchers\/(\d+)\/([a-z-]+)$/);
  if (subresourceMatch) {
    return CATCHER_SUBRESOURCES[subresourceMatch[2]]?.[subresourceMatch[1]];
  }

  return undefined;
}
