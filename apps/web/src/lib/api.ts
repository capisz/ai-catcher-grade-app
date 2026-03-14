import {
  catcherDetailResponseSchema,
  catchersResponseSchema,
  countsResponseSchema,
  leaderboardResponseSchema,
  pairingsResponseSchema,
  pitchTypesResponseSchema,
  recommendationResponseSchema,
  type CatcherDetailResponse,
  type CatchersResponse,
  type CountsResponse,
  type LeaderboardResponse,
  type PairingsResponse,
  type PitchTypesResponse,
  type RecommendationResponse,
} from "@catcher-intel/contracts";
import { headers } from "next/headers";

const UPSTREAM_API_URL =
  process.env.INTERNAL_API_URL ??
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000";

const healthSchema = {
  parse(value: unknown) {
    if (
      value &&
      typeof value === "object" &&
      "status" in value &&
      typeof value.status === "string"
    ) {
      return { status: value.status };
    }
    throw new Error("Response validation failed");
  },
};

export class ApiRequestError extends Error {
  status?: number;
  path: string;
  url: string;

  constructor(message: string, path: string, status?: number, url?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.path = path;
    this.status = status;
    this.url = url ?? path;
  }
}

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function resolveApiBaseUrl() {
  if (typeof window !== "undefined") {
    return "/api/backend";
  }

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "127.0.0.1:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host}/api/backend`;
}

async function fetchJson<T>(path: string, schema: { parse: (value: unknown) => T }): Promise<T> {
  const apiBaseUrl = trimTrailingSlash(await resolveApiBaseUrl());
  const url = `${apiBaseUrl}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
    });
  } catch (error) {
    throw new ApiRequestError(
      error instanceof Error ? `Network error calling ${url}: ${error.message}` : `Network error calling ${url}`,
      path,
      undefined,
      url,
    );
  }

  if (!response.ok) {
    let detail = `Request failed: ${response.status}`;
    try {
      const body = await response.json();
      if (body && typeof body.detail === "string") {
        detail = body.detail;
      }
    } catch {
      // Keep the status message when the error body is not JSON.
    }
    throw new ApiRequestError(`${detail} (${url})`, path, response.status, url);
  }

  const json = await response.json();
  try {
    return schema.parse(json);
  } catch (error) {
    throw new ApiRequestError(
      `${error instanceof Error ? error.message : "Response validation failed"} (${url})`,
      path,
      response.status,
      url,
    );
  }
}

type CatcherQuery = {
  season?: number;
};

type LeaderboardQuery = {
  minPitches?: number;
  season?: number;
  dateFrom?: string;
  dateTo?: string;
};

type RecommendationQuery = {
  catcherId?: number;
  pitcherId: number;
  batterId?: number;
  stand: "L" | "R" | "S";
  pThrows: "L" | "R";
  balls: number;
  strikes: number;
  outsWhenUp: number;
  baseState: string;
  prevPitchType1?: string;
  prevPitchType2?: string;
};

export async function getCatchers(query: CatcherQuery = {}): Promise<CatchersResponse> {
  const searchParams = new URLSearchParams();
  if (query.season) {
    searchParams.set("season", String(query.season));
  }

  return fetchJson(
    `/catchers${searchParams.size ? `?${searchParams.toString()}` : ""}`,
    catchersResponseSchema,
  );
}

export async function getApiHealth(): Promise<{ status: string }> {
  return fetchJson("/health", healthSchema);
}

export async function getLeaderboard(query: LeaderboardQuery = {}): Promise<LeaderboardResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("min_pitches", String(query.minPitches ?? 50));
  if (query.season) {
    searchParams.set("season", String(query.season));
  }
  if (query.dateFrom) {
    searchParams.set("date_from", query.dateFrom);
  }
  if (query.dateTo) {
    searchParams.set("date_to", query.dateTo);
  }

  return fetchJson(
    `/catchers/leaderboard?${searchParams.toString()}`,
    leaderboardResponseSchema,
  );
}

export async function getCatcherDetail(
  catcherId: number,
  query: CatcherQuery = {},
): Promise<CatcherDetailResponse> {
  const searchParams = new URLSearchParams();
  if (query.season) {
    searchParams.set("season", String(query.season));
  }

  return fetchJson(
    `/catchers/${catcherId}${searchParams.size ? `?${searchParams.toString()}` : ""}`,
    catcherDetailResponseSchema,
  );
}

export async function getCatcherPairings(
  catcherId: number,
  query: CatcherQuery & { limit?: number } = {},
): Promise<PairingsResponse> {
  const searchParams = new URLSearchParams();
  if (query.season) {
    searchParams.set("season", String(query.season));
  }
  if (query.limit) {
    searchParams.set("limit", String(query.limit));
  }

  return fetchJson(
    `/catchers/${catcherId}/pairings${searchParams.size ? `?${searchParams.toString()}` : ""}`,
    pairingsResponseSchema,
  );
}

export async function getCatcherCounts(
  catcherId: number,
  query: CatcherQuery = {},
): Promise<CountsResponse> {
  const searchParams = new URLSearchParams();
  if (query.season) {
    searchParams.set("season", String(query.season));
  }

  return fetchJson(
    `/catchers/${catcherId}/counts${searchParams.size ? `?${searchParams.toString()}` : ""}`,
    countsResponseSchema,
  );
}

export async function getCatcherPitchTypes(
  catcherId: number,
  query: CatcherQuery = {},
): Promise<PitchTypesResponse> {
  const searchParams = new URLSearchParams();
  if (query.season) {
    searchParams.set("season", String(query.season));
  }

  return fetchJson(
    `/catchers/${catcherId}/pitch-types${searchParams.size ? `?${searchParams.toString()}` : ""}`,
    pitchTypesResponseSchema,
  );
}

export async function getAtbatRecommendation(
  query: RecommendationQuery,
): Promise<RecommendationResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("pitcher_id", String(query.pitcherId));
  searchParams.set("stand", query.stand);
  searchParams.set("p_throws", query.pThrows);
  searchParams.set("balls", String(query.balls));
  searchParams.set("strikes", String(query.strikes));
  searchParams.set("outs_when_up", String(query.outsWhenUp));
  searchParams.set("base_state", query.baseState);
  if (query.catcherId) {
    searchParams.set("catcher_id", String(query.catcherId));
  }
  if (query.batterId) {
    searchParams.set("batter_id", String(query.batterId));
  }
  if (query.prevPitchType1) {
    searchParams.set("prev_pitch_type_1", query.prevPitchType1);
  }
  if (query.prevPitchType2) {
    searchParams.set("prev_pitch_type_2", query.prevPitchType2);
  }

  return fetchJson(
    `/atbat/recommendation?${searchParams.toString()}`,
    recommendationResponseSchema,
  );
}

export async function getApiBaseUrl() {
  return resolveApiBaseUrl();
}

export function getUpstreamApiBaseUrl() {
  return trimTrailingSlash(UPSTREAM_API_URL);
}
