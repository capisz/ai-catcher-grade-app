import {
  catcherDetailResponseSchema,
  catcherReportOptionsResponseSchema,
  catchersResponseSchema,
  countsResponseSchema,
  leaderboardResponseSchema,
  pairingsResponseSchema,
  pitchTypesResponseSchema,
  recommendationResponseSchema,
  type CatcherDetailResponse,
  type CatcherReportOptionsResponse,
  type CatchersResponse,
  type CountsResponse,
  type LeaderboardResponse,
  type PairingsResponse,
  type PitchTypesResponse,
  type RecommendationResponse,
} from "@catcher-intel/contracts";
import {
  formatApiTransportLabel,
  getApiTransportInfo,
  getBackendApiConfig,
  resolveProxyApiBaseUrl,
  trimTrailingSlash,
} from "@/lib/api-transport";

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

type ApiErrorPayload = {
  detail?: unknown;
  targetUrl?: unknown;
  backendBaseUrl?: unknown;
  configuredFrom?: unknown;
  hint?: unknown;
  upstreamError?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function resolveApiBaseUrl() {
  return resolveProxyApiBaseUrl();
}

async function readErrorPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as ApiErrorPayload;
  } catch {
    return text;
  }
}

function buildErrorDetail(status: number, payload: unknown, fallbackUrl: string) {
  const parts: string[] = [];

  if (typeof payload === "string" && payload.trim()) {
    parts.push(payload.trim());
  } else if (isRecord(payload) && typeof payload.detail === "string") {
    parts.push(payload.detail);
  } else {
    parts.push(`Request failed: ${status}`);
  }

  if (isRecord(payload)) {
    if (typeof payload.backendBaseUrl === "string") {
      parts.push(`Backend base URL: ${payload.backendBaseUrl}`);
    }
    if (typeof payload.targetUrl === "string") {
      parts.push(`Request target: ${payload.targetUrl}`);
    }
    if (typeof payload.configuredFrom === "string") {
      parts.push(`Config source: ${payload.configuredFrom}`);
    }
    if (typeof payload.hint === "string") {
      parts.push(payload.hint);
    }
    if (typeof payload.upstreamError === "string") {
      parts.push(`Upstream error: ${payload.upstreamError}`);
    }
  } else {
    parts.push(`Request URL: ${fallbackUrl}`);
  }

  return parts.join(" ");
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
    const payload = await readErrorPayload(response);
    throw new ApiRequestError(buildErrorDetail(response.status, payload, url), path, response.status, url);
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

export type CatcherReportRequest = {
  season: number;
  format: "csv" | "json" | "pdf";
  includedSections: string[];
  dateFrom?: string;
  dateTo?: string;
  minPitches?: number;
};

export type DownloadedReport = {
  blob: Blob;
  filename: string;
  contentType: string;
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

export async function getCatcherReportOptions(
  catcherId: number,
  query: CatcherQuery = {},
): Promise<CatcherReportOptionsResponse> {
  const searchParams = new URLSearchParams();
  if (query.season) {
    searchParams.set("season", String(query.season));
  }

  return fetchJson(
    `/catchers/${catcherId}/report/options${searchParams.size ? `?${searchParams.toString()}` : ""}`,
    catcherReportOptionsResponseSchema,
  );
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

export async function getApiTransport() {
  return getApiTransportInfo();
}

export function getUpstreamApiBaseUrl() {
  return getBackendApiConfig().baseUrl;
}

function parseFilename(contentDisposition: string | null, fallback: string) {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const basicMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return basicMatch?.[1] ?? fallback;
}

export async function downloadCatcherReport(
  catcherId: number,
  payload: CatcherReportRequest,
): Promise<DownloadedReport> {
  const apiBaseUrl = trimTrailingSlash(await resolveApiBaseUrl());
  const url = `${apiBaseUrl}/catchers/${catcherId}/report`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/csv, application/zip",
      },
      body: JSON.stringify({
        season: payload.season,
        format: payload.format,
        included_sections: payload.includedSections,
        date_from: payload.dateFrom,
        date_to: payload.dateTo,
        min_pitches: payload.minPitches ?? 20,
      }),
      cache: "no-store",
    });
  } catch (error) {
    throw new ApiRequestError(
      error instanceof Error ? `Network error calling ${url}: ${error.message}` : `Network error calling ${url}`,
      `/catchers/${catcherId}/report`,
      undefined,
      url,
    );
  }

  if (!response.ok) {
    const payload = await readErrorPayload(response);
    throw new ApiRequestError(
      buildErrorDetail(response.status, payload, url),
      `/catchers/${catcherId}/report`,
      response.status,
      url,
    );
  }

  return {
    blob: await response.blob(),
    filename: parseFilename(
      response.headers.get("content-disposition"),
      `catcher-report_${catcherId}_${payload.season}.${payload.format === "csv" && payload.includedSections.length > 1 ? "zip" : payload.format}`,
    ),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
  };
}

export { formatApiTransportLabel };
export type { ApiTransportInfo } from "@/lib/api-transport";
