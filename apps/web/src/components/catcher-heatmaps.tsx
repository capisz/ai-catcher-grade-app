"use client";

import { useEffect, useRef, useState } from "react";
import { PlayerHeadshot } from "@/components/player-headshot";
import type { CatcherLocation, CatcherLocations } from "@/lib/catcher-locations";

const WIDTH = 300, HEIGHT = 300;
const COLORS = [[79,116,170], [112,148,196], [163,187,217], [221,230,239], [250,217,219], [242,163,173], [226,91,110], [190,35,63]];
// Coordinates stay in catcher's view. Normalize height to each batter's recorded zone.
const px = (x: number) => 150 + x * 60;
const py = (z: number) => 208 - z * 116;
function density(points: CatcherLocation[]) {
  const grid = new Float32Array(WIDTH * HEIGHT);
  for (const p of points) {
    const x = px(p.x), y = py(p.z), radius = 34, bandwidth = 11;
    for (let row = Math.max(0, Math.floor(y-radius)); row < Math.min(HEIGHT, y+radius); row++) {
      for (let col = Math.max(0, Math.floor(x-radius)); col < Math.min(WIDTH, x+radius); col++) {
        grid[row*WIDTH+col] += Math.exp(-((col-x)**2+(row-y)**2)/(2*bandwidth**2));
      }
    }
  }
  return grid;
}
function Plot({ points, grid, peak, hand }: { points: CatcherLocation[]; grid: Float32Array; peak: number; hand: "R" | "L" }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(WIDTH, HEIGHT);
    for (let i=0; i<grid.length; i++) {
      const intensity = peak ? grid[i]/peak : 0;
      if (intensity < .065) continue;
      const color = COLORS[Math.min(7, Math.floor(intensity*8))];
      image.data.set([...color, 255], i*4);
    }
    ctx.putImageData(image, 0, 0);
  }, [grid, peak]);
  return <figure className="min-w-0">
    <figcaption className="flex items-baseline justify-between gap-3 text-sm">
      <span className="font-semibold text-white">vs {hand === "R" ? "right-handed" : "left-handed"}</span>
      <span className="numeric text-xs text-white/65">{points.length} pitches</span>
    </figcaption>
    <div className="relative mx-auto mt-3 aspect-square w-full max-w-[360px] overflow-hidden rounded-xl bg-[#101d2c]">
      <svg viewBox="0 0 300 300" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {/* Original batting-stance vector; mirror the figure, never the pitch coordinates. */}
        <g transform={hand === "L" ? "translate(300 0) scale(-1 1)" : undefined} fill="#b7c5d8" fillOpacity=".23" stroke="#b7c5d8" strokeOpacity=".35" strokeWidth=".7" strokeLinejoin="round">
          {/* Bat, helmet, face and neck. */}
          <path d="M79 85 23 32Q20 29 23 25Q26 22 29 26L83 81Z" />
          <path d="M43 64Q42 47 56 46Q69 46 70 60L76 64L68 67H44Z" />
          <path d="M48 65H68L68 73L72 77L67 80L65 88L55 90L50 84Z" />
          {/* Jersey and bent arms holding the bat above the rear shoulder. */}
          <path d="M48 86Q39 89 35 101L31 137L36 154Q51 163 68 151L72 119L83 123Q89 122 90 115L88 88Q86 81 81 82Q77 84 79 91L80 108L68 100L62 92Z" />
          <path d="M40 98Q39 105 47 108L61 111L81 91Q87 87 83 82Q79 78 75 83L59 98L49 94Q43 92 40 98Z" />
          {/* Pants, flexed knees and planted cleats. */}
          <path d="M36 151Q31 164 35 181L45 207L31 246L25 252L25 258L48 258Q53 257 51 252L45 247L61 211Q64 205 60 195L53 176L64 190L72 210L67 241L64 248L65 253L88 253Q92 249 86 247L79 243L87 210Q88 204 84 197L68 152Q54 159 36 151Z" />
          <path d="M43 157 52 175M61 211 54 201M72 210 80 207M32 246 45 247M68 240 79 243" fill="none" />
        </g>
      </svg>
      <canvas ref={canvas} width={WIDTH} height={HEIGHT} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      <svg viewBox="0 0 300 300" className="absolute inset-0 h-full w-full" role="img" aria-label={`${hand === "R" ? "Right" : "Left"}-handed batters: ${points.length} located pitches. Blue indicates lower concentration; red indicates higher concentration. Catcher's view.`}>
        <g fill="none" stroke="#d4dce8">
          <rect x="107.5" y="92" width="85" height="116" strokeWidth="1.8" />
          <path d="M136 92V208M164 92V208M107.5 131H192.5M107.5 169H192.5" strokeOpacity=".3" strokeDasharray="3 4" />
          <path d="M125 243H175V256L150 270L125 256Z" fill="#d4dce8" fillOpacity=".09" strokeOpacity=".6" />
        </g>
        <text x={hand === "R" ? 51 : 248} y="275" textAnchor="middle" fill="#b7c5d8" fontSize="11">{hand === "R" ? "RHB" : "LHB"}</text>
        <text x="150" y="288" textAnchor="middle" fill="#b7c5d8" fontSize="9">CATCHER’S VIEW</text>
      </svg>
      {!points.length ? <div className="absolute inset-x-6 top-5 text-center text-xs text-white/75">No matching located pitches</div> : null}
    </div>
    {points.length > 0 && points.length < 20 ? <p className="mt-2 text-xs text-white/65">Small sample · individual pitches can dominate.</p> : null}
  </figure>;
}

export function CatcherHeatmaps({ data, side, team }: { data: { catchers: CatcherLocations[]; unattributed_pitches: number }; side: "home" | "away"; team: string }) {
  const [catcherId, setCatcherId] = useState<number | null>(null);
  const [metric, setMetric] = useState<"all" | "whiffs">("all");
  const catchers = data.catchers.filter(c => c.side === side);
  const catcher = catchers.find(c => c.id === catcherId) ?? catchers[0];
  const selectedId = catcher?.id;
  const { right, left, rightGrid, leftGrid, peak } = (() => {
    const points = (data.catchers.find(c => c.id === selectedId)?.locations ?? []).filter(p => metric === "all" || p.swinging_strike);
    const right = points.filter(p => p.hand === "R"), left = points.filter(p => p.hand === "L");
    const rightGrid = density(right), leftGrid = density(left);
    let peak = 0;
    for (const grid of [rightGrid, leftGrid]) for (const v of grid) peak = Math.max(peak, v);
    return { right, left, rightGrid, leftGrid, peak };
  })();
  return <section className="panel-dark rounded-xl p-5 text-white" aria-label="Catcher pitch-location heatmaps">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {catcher ? <PlayerHeadshot playerId={catcher.id} name={catcher.name} size={56} /> : null}
        <div><h2 className="font-serif text-xl">{catcher?.name ?? team}</h2><p className="mt-1 text-sm text-white/65">Pitch locations · selected game</p></div>
      </div>
      <label className="text-xs text-white/70">Show
        <select value={metric} onChange={e => setMetric(e.target.value as "all" | "whiffs")} className="ml-2 rounded-lg border border-white/20 bg-[#152436] px-3 py-2 text-sm text-white">
          <option value="all">All pitches</option><option value="whiffs">Swinging strikes</option>
        </select>
      </label>
    </div>
    {catchers.length > 1 ? <div className="mt-4 flex flex-wrap gap-2" aria-label="Select catcher">{catchers.map(c => <button key={c.id} aria-pressed={catcher?.id === c.id} onClick={() => setCatcherId(c.id)} className={`rounded-lg border px-3 py-2 text-sm ${catcher?.id === c.id ? "border-white/50 bg-white/10 text-white" : "border-white/15 text-white/65 hover:bg-white/5"}`}>{c.name}</button>)}</div> : null}
    {catcher ? <>
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Plot points={right} grid={rightGrid} peak={peak} hand="R" /><Plot points={left} grid={leftGrid} peak={peak} hand="L" />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-white/70"><span>Less concentrated</span><span className="flex overflow-hidden rounded-sm" aria-hidden="true">{COLORS.map(c => <span key={c.join()} className="h-2.5 w-5" style={{ background: `rgb(${c.join()})` }} />)}</span><span>More concentrated</span></div>
      <p className="mt-4 text-xs leading-5 text-white/65">{catcher.locations.length} of {catcher.pitches} received pitches have location, strike-zone height, and batting-side data. Smoothed pitch counts use the same color scale across both charts; height is normalized to each batter’s strike zone. Color shows concentration, not effectiveness.{catcher.locations.some(p => Math.abs(p.x)>2.5 || p.z < -.79 || p.z > 1.79) ? " Some pitches fall beyond the plotted area." : ""}</p>
    </> : <p className="mt-6 text-sm text-white/70">Catcher-attributed locations are not available for this game yet.</p>}
    {data.unattributed_pitches > 0 ? <p className="mt-2 text-xs text-white/65">{data.unattributed_pitches} game pitches could not be assigned to a catcher and are excluded.</p> : null}
  </section>;
}
