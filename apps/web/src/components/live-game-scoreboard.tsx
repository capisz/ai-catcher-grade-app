import type { LiveGameContext } from "@/lib/live-game-context";
import { PlayerHeadshot } from "@/components/player-headshot";

const value = (number: number | null) => number ?? "—";

export function LiveGameScoreboard({ context }: { context: LiveGameContext }) {
  const final = context.state === "Final";
  const live = context.state === "Live";
  const activeAtBat = live && context.outs !== 3 && ["Top", "Bottom"].includes(context.inning_state ?? "");
  const count = Math.max(context.scheduled_innings ?? 9, ...context.innings.map(inning => inning.num ?? 0));
  const innings = Array.from({ length: count }, (_, index) => index + 1);
  const startTime = context.start_time ? new Date(context.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }) : null;

  return (
    <section className="surface-panel min-w-0 overflow-hidden rounded-xl" aria-label="Game scoreboard">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-ink">{context.detailed_state ?? context.state ?? "Scheduled"}</span>
          {live && context.inning ? <span className="text-accent">{context.inning_state} {context.inning}</span> : null}
          {!live && !final && startTime ? <span className="text-muted">{startTime}</span> : null}
        </div>
        <div className="text-xs text-muted">{context.venue ?? "Venue unavailable"}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-line p-4 sm:hidden" aria-label="Game score">
        {(["away", "home"] as const).map(side => <div key={side}>
          <p className="text-xs text-muted">{context.teams[side].name ?? side}</p>
          <p className="numeric mt-1 text-3xl font-semibold text-ink">{value(context.teams[side].runs)}</p>
        </div>)}
      </div>
      <div className="overflow-x-auto p-4 sm:p-5" tabIndex={0} role="region" aria-label="Inning scores, scroll horizontally for all innings">
        <table className="w-full min-w-[32rem] text-center text-xs tabular-nums">
          <caption className="sr-only">Runs by inning and total runs, hits, and errors</caption>
          <thead className="text-muted">
            <tr><th scope="col" className="pb-3 text-left font-medium">Team</th>
              {innings.map(inning => <th scope="col" key={inning} className="min-w-7 pb-3 font-medium">{inning}</th>)}
              {["R", "H", "E"].map(label => <th scope="col" key={label} className="min-w-8 pb-3 font-semibold">{label}</th>)}
            </tr>
          </thead>
          <tbody>
            {(["away", "home"] as const).map(side => {
              const team = context.teams[side];
              return <tr key={side} className="border-t border-line/60">
                <th scope="row" className="max-w-40 py-3 pr-3 text-left text-sm font-semibold text-ink" title={team.name ?? side}>{team.abbreviation ?? team.name ?? side}</th>
                {innings.map(num => {
                  const inning = context.innings.find(row => row.num === num);
                  const runs = inning?.[side] ?? null;
                  const skipped = final && side === "home" && num === context.inning && runs == null && context.teams.home.runs != null && context.teams.away.runs != null && context.teams.home.runs > context.teams.away.runs;
                  const active = live && num === context.inning && ((side === "away" && context.inning_state === "Top") || (side === "home" && context.inning_state === "Bottom"));
                  return <td key={num} className={active ? "rounded bg-accent/15 font-semibold text-accent" : "text-muted-strong"}>{skipped ? "X" : value(runs)}</td>;
                })}
                <td className="bg-accent/10 text-base font-bold text-ink">{value(team.runs)}</td><td className="text-muted-strong">{value(team.hits)}</td><td className="text-muted-strong">{value(team.errors)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-line p-4 sm:p-5">
        {live ? <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="label-kicker">{activeAtBat ? "On the field" : "Last reported situation"}</h2>
            <div className="flex gap-4 text-sm font-semibold text-ink">
              {activeAtBat ? <span>{value(context.balls)}–{value(context.strikes)} <span className="font-normal text-muted">count</span></span> : null}
              <span>{value(context.outs)} <span className="font-normal text-muted">outs</span></span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ["Pitching", context.matchup.pitcher, context.matchup.pitcher_hand],
              ["Catching", context.matchup.catcher, null],
              ["Batting", context.matchup.batter, context.matchup.batter_hand],
            ] as const).map(([label, player, hand]) => <div key={label} className="rounded-lg border border-line bg-black/10 p-3">
              <div className="label-kicker">{label}</div>
              <div className="mt-3 flex items-center gap-3 sm:flex-col sm:items-start">
                <PlayerHeadshot playerId={player.id} name={player.name} size={64} />
                <p className="min-w-0 text-sm font-semibold text-ink">{player.name ?? "Not reported"}{hand ? <span className="ml-2 text-xs font-normal text-muted">{hand}</span> : null}</p>
              </div>
            </div>)}
          </div>
          {activeAtBat ? <div className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="Base runners">
            {(["first", "second", "third"] as const).map((base, index) => <div key={base} className={`rounded-lg border px-3 py-2 text-xs ${context.runners[base].id ? "border-accent/40 bg-accent/10 text-ink" : "border-line text-muted"}`}><span className="mr-2 font-semibold">{index + 1}B</span>{context.runners[base].name ?? "Empty"}</div>)}
          </div> : null}
          {activeAtBat && context.matchup.on_deck.name ? <p className="mt-3 text-xs text-muted">On deck: <span className="text-muted-strong">{context.matchup.on_deck.name}</span></p> : null}
        </> : final ? <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {(["winner", "loser", "save"] as const).map((key, index) => context.decisions[key].name ? <div key={key} className="flex items-center gap-3"><PlayerHeadshot playerId={context.decisions[key].id} name={context.decisions[key].name} size={44} className="rounded-full" /><p><span className="mr-2 text-xs font-semibold text-accent">{["W", "L", "SV"][index]}</span><span className="text-ink">{context.decisions[key].name}</span></p></div> : null)}
          {!context.decisions.winner.name ? <p className="text-muted">Game complete. Pitching decisions have not been reported.</p> : null}
        </div> : <div>
          <h2 className="label-kicker">Probable starting pitchers</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{(["away", "home"] as const).map(side => <div key={side} className="flex items-center gap-3"><PlayerHeadshot playerId={context.probable_pitchers[side].id} name={context.probable_pitchers[side].name} size={56} /><p className="text-sm text-ink"><span className="mr-2 text-xs text-muted">{context.teams[side].abbreviation ?? side}</span>{context.probable_pitchers[side].name ?? "To be announced"}</p></div>)}</div>
          <p className="mt-3 text-xs text-muted">Pitch tracking will appear when MLB reports game events.</p>
        </div>}
        {context.weather.condition ? <p className="mt-4 text-xs text-muted">{context.weather.condition}{context.weather.temperature ? ` · ${context.weather.temperature}°F` : ""}{context.weather.wind ? ` · ${context.weather.wind}` : ""}</p> : null}
      </div>

      {context.recent_plays.length ? <details className="border-t border-line px-4 py-3 sm:px-5">
        <summary className="cursor-pointer text-xs font-semibold text-ink">Recent plays · {context.recent_plays.length} completed plate appearances</summary>
        <ol className="mt-3 space-y-3">{context.recent_plays.map((play, index) => <li key={index} className="flex gap-3 text-xs leading-5"><span className="shrink-0 text-muted">{play.half === "top" ? "T" : "B"}{play.inning}</span><span className={play.scoring ? "text-accent" : "text-muted-strong"}>{play.description ?? "Play details unavailable"}</span></li>)}</ol>
      </details> : null}
    </section>
  );
}
