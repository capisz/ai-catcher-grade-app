import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

import { liveGamePitches, liveGameZoneReport } from "@/lib/live-mlb";

/**
 * Streams a Claude-written read of a catcher's live game-calling zone report.
 *
 * Ships dark: without ANTHROPIC_API_KEY the endpoint returns 503
 * ai_not_configured and the UI hides the analyst card entirely. Responses are
 * cached in-memory per (game, side, located-pitch count) so the dashboard's
 * 20-second polls never re-bill — a new analysis is only generated after new
 * pitches have been located.
 */

const MODEL = "claude-opus-4-8";
const CACHE_TTL_MS = 5 * 60_000;

const analysisCache = new Map<string, { expiresAt: number; text: string }>();

const SYSTEM_PROMPT = `You are a sharp MLB broadcast analyst covering catcher game-calling in real time.

You receive JSON describing one catcher's pitch-calling in a single game, scored against each batter's season hot/cold zones:
- "zones": nine strike-zone cells (catcher's view; 1 = up-and-glove-side through 9 = down-and-arm-side). Each has the share of called pitches located there (pitch_share), how hot the batters faced are in that zone (avg_batter_hotness, 0 cold to 1 hot), and the batters' average in that zone (avg_batter_value).
- "grade": a 20-80 scouting grade for how well calls avoided batter hot zones (50 is average).
- "hot_zone_pitch_pct": share of pitches that went INTO batters' top-3 hottest zones.
- "recent_pitches": the latest pitch events.

Write a tight analysis of how this catcher is calling the game:
- 3 to 5 sentences, then at most 2 bullet callouts.
- Ground every claim in the supplied numbers. Never invent stats, names, or events that are not in the JSON. If the sample is thin, say so.
- Talk like an analyst, not a data dump: lead with the story (avoiding or feeding hot zones), cite 2-3 specific numbers max.
- No preamble, no headers, no restating the question.`;

type AnalysisRequest = {
  gamePk?: unknown;
  side?: unknown;
};

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ai_not_configured" }, { status: 503 });
  }

  let body: AnalysisRequest;
  try {
    body = (await request.json()) as AnalysisRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const gamePk = Number(body.gamePk);
  const side = body.side === "home" || body.side === "away" ? body.side : null;
  if (!Number.isInteger(gamePk) || gamePk <= 0 || !side) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const report = await liveGameZoneReport(String(gamePk));
  const sides = report.sides as Record<string, Record<string, unknown>>;
  const sideReport = sides[side];
  if (!sideReport || !Number(sideReport.pitches_located)) {
    return NextResponse.json({ error: "no_pitches_to_analyze" }, { status: 422 });
  }

  const cacheKey = `${gamePk}:${side}:${sideReport.pitches_located}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return new Response(cached.text, {
      headers: { "content-type": "text/plain; charset=utf-8", "x-ai-cache": "hit" },
    });
  }

  const feed = await liveGamePitches(String(gamePk), 30);
  const payload = {
    game_state: report.detailed_state,
    side,
    catcher: sideReport.catcher,
    grade: sideReport.grade,
    score: sideReport.score,
    pitches_located: sideReport.pitches_located,
    hot_zone_pitch_pct: sideReport.hot_zone_pitch_pct,
    zones: sideReport.zones,
    recent_pitches: feed.pitches.map((pitch) => ({
      inning: pitch.inning,
      half: pitch.half,
      batter: pitch.batter,
      count: pitch.count,
      pitch_type: pitch.pitch_type,
      call: pitch.call,
      zone: pitch.zone,
    })),
  };

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Analyze this catcher's live game-calling:\n${JSON.stringify(payload)}`,
      },
    ],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullText = "";
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            fullText += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        if (fullText) {
          analysisCache.set(cacheKey, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            text: fullText,
          });
        }
      } catch (error) {
        const detail =
          error instanceof Anthropic.APIError
            ? `analysis unavailable (${error.status})`
            : "analysis interrupted";
        controller.enqueue(encoder.encode(`\n[${detail}]`));
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "content-type": "text/plain; charset=utf-8", "x-ai-cache": "miss" },
  });
}
