import { NextRequest, NextResponse } from "next/server";

const UPSTREAM_API_URL =
  process.env.INTERNAL_API_URL ??
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://127.0.0.1:8000";

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildUpstreamUrl(request: NextRequest, path: string[]) {
  const target = new URL(`${trimTrailingSlash(UPSTREAM_API_URL)}/${path.join("/")}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });
  return target;
}

async function proxy(request: NextRequest, path: string[]) {
  const target = buildUpstreamUrl(request, path);

  try {
    const response = await fetch(target, {
      method: request.method,
      headers: {
        accept: request.headers.get("accept") ?? "application/json",
      },
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") ?? "application/json";
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": contentType,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? `Proxy could not reach ${target.toString()}: ${error.message}`
            : `Proxy could not reach ${target.toString()}`,
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
