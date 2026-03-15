export const API_PROXY_PATH = "/api/backend";
export const DEFAULT_BACKEND_API_URL = "http://127.0.0.1:8000";

export type BackendApiConfigSource =
  | "INTERNAL_API_URL"
  | "API_BASE_URL"
  | "NEXT_PUBLIC_API_URL"
  | "default";

export type BackendApiConfig = {
  baseUrl: string;
  configuredFrom: BackendApiConfigSource;
  usingDefault: boolean;
};

export type ApiTransportInfo = {
  proxyBaseUrl: string;
  proxyPath: string;
  backendBaseUrl: string;
  configuredFrom: string;
  usingDefault: boolean;
};

export function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizeConfiguredApiUrl(value: string, source: Exclude<BackendApiConfigSource, "default">) {
  const trimmed = trimTrailingSlash(value.trim());

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${source} must be an absolute URL such as http://127.0.0.1:8000.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${source} must start with http:// or https://.`);
  }

  return trimTrailingSlash(parsed.toString());
}

export function getBackendApiConfig(): BackendApiConfig {
  const candidates = [
    { source: "INTERNAL_API_URL" as const, value: process.env.INTERNAL_API_URL },
    { source: "API_BASE_URL" as const, value: process.env.API_BASE_URL },
    { source: "NEXT_PUBLIC_API_URL" as const, value: process.env.NEXT_PUBLIC_API_URL },
  ];

  for (const candidate of candidates) {
    if (candidate.value?.trim()) {
      return {
        baseUrl: normalizeConfiguredApiUrl(candidate.value, candidate.source),
        configuredFrom: candidate.source,
        usingDefault: false,
      };
    }
  }

  return {
    baseUrl: DEFAULT_BACKEND_API_URL,
    configuredFrom: "default",
    usingDefault: true,
  };
}

export function formatBackendConfigSource(config: BackendApiConfig) {
  return config.configuredFrom === "default"
    ? `default fallback (${DEFAULT_BACKEND_API_URL})`
    : config.configuredFrom;
}

export async function resolveProxyApiBaseUrl() {
  if (typeof window !== "undefined") {
    return API_PROXY_PATH;
  }

  const { headers } = await import("next/headers");
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "127.0.0.1:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("127.0.0.1") || host.startsWith("localhost") ? "http" : "https");

  return `${protocol}://${host}${API_PROXY_PATH}`;
}

export async function getApiTransportInfo(): Promise<ApiTransportInfo> {
  const backend = getBackendApiConfig();

  return {
    proxyBaseUrl: trimTrailingSlash(await resolveProxyApiBaseUrl()),
    proxyPath: API_PROXY_PATH,
    backendBaseUrl: backend.baseUrl,
    configuredFrom: formatBackendConfigSource(backend),
    usingDefault: backend.usingDefault,
  };
}

export function formatApiTransportLabel(transport: ApiTransportInfo) {
  return `${transport.proxyBaseUrl} -> ${transport.backendBaseUrl}`;
}
