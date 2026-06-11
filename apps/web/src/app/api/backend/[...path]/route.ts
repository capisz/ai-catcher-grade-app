import { NextRequest, NextResponse } from "next/server";
import {
  formatBackendConfigSource,
  getBackendApiConfig,
  trimTrailingSlash,
} from "@/lib/api-transport";
import { handleLiveFallback, isLivePath } from "@/lib/live-mlb";

function buildUpstreamUrl(request: NextRequest, backendBaseUrl: string, path: string[]) {
  const target = new URL(`${trimTrailingSlash(backendBaseUrl)}/${path.join("/")}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });
  return target;
}

function backendHint(backendBaseUrl: string, usingDefault: boolean) {
  if (usingDefault) {
    return `Set API_BASE_URL or NEXT_PUBLIC_API_URL to the running FastAPI base URL if it is not ${backendBaseUrl}.`;
  }

  return `Confirm the backend is running at ${backendBaseUrl} or update the configured API base URL.`;
}

async function proxy(request: NextRequest, path: string[]) {
  let backendBaseUrl: string;
  let configuredFrom: string;
  let usingDefault = false;
  let target: URL;

  try {
    const backend = getBackendApiConfig();
    if (backend.usingDefault && process.env.NODE_ENV === "production") {
      // The /live routes only relay the public MLB Stats API, so a
      // frontend-only deployment can serve them without a backend.
      if (isLivePath(path)) {
        return handleLiveFallback(request, path);
      }
      // Never fall back to localhost outside development; the deployment must
      // set API_BASE_URL / INTERNAL_API_URL / NEXT_PUBLIC_API_URL explicitly.
      return NextResponse.json(
        {
          error: "backend_not_configured",
          detail:
            "No backend API URL is configured. Set API_BASE_URL (or INTERNAL_API_URL / NEXT_PUBLIC_API_URL) for this deployment.",
        },
        { status: 503 },
      );
    }
    backendBaseUrl = backend.baseUrl;
    configuredFrom = formatBackendConfigSource(backend);
    usingDefault = backend.usingDefault;
    target = buildUpstreamUrl(request, backendBaseUrl, path);
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "The web proxy backend URL is invalid.",
        hint: "Set API_BASE_URL to an absolute URL such as http://127.0.0.1:8000.",
      },
      { status: 500 },
    );
  }

  const requestHeaders = new Headers();
  const accept = request.headers.get("accept");
  const contentType = request.headers.get("content-type");
  if (accept) {
    requestHeaders.set("accept", accept);
  }
  if (contentType) {
    requestHeaders.set("content-type", contentType);
  }

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();

  try {
    const response = await fetch(target, {
      method: request.method,
      headers: requestHeaders,
      body,
      cache: "no-store",
    });

    const responseBody = await response.arrayBuffer();
    const headers = new Headers();
    const responseContentType = response.headers.get("content-type");
    const disposition = response.headers.get("content-disposition");
    const cacheControl = response.headers.get("cache-control");
    if (responseContentType) {
      headers.set("content-type", responseContentType);
    }
    if (disposition) {
      headers.set("content-disposition", disposition);
    }
    if (cacheControl) {
      headers.set("cache-control", cacheControl);
    }

    return new NextResponse(responseBody, {
      status: response.status,
      headers,
    });
  } catch (error) {
    // Backend unreachable: live routes can still be served straight from the
    // public MLB Stats API.
    if (isLivePath(path)) {
      return handleLiveFallback(request, path);
    }
    return NextResponse.json(
      {
        detail: "Proxy could not reach configured backend target.",
        backendBaseUrl,
        targetUrl: target.toString(),
        configuredFrom,
        hint: backendHint(backendBaseUrl, usingDefault),
        upstreamError: error instanceof Error ? error.message : undefined,
      },
      { status: 503 },
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(request, path);
}
