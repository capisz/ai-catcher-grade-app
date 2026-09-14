/** Pitch locations attributed by starting fielding position and chronological substitutions. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>; // MLB's unversioned feed is narrowed at the boundary below.
export type CatcherLocation = { x: number; z: number; hand: "R" | "L"; swinging_strike: boolean };
export type CatcherLocations = { id: number; name: string; side: "home" | "away"; pitches: number; locations: CatcherLocation[] };
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export function buildCatcherLocations(payload: Row): { catchers: CatcherLocations[]; unattributed_pitches: number } {
  const teams = payload.liveData?.boxscore?.teams ?? {};
  const active: Record<string, number | null> = { home: null, away: null };
  const members = new Map<number, { side: "home" | "away"; name: string }>();
  const catchers = new Map<number, CatcherLocations>();
  const register = (id: number) => {
    const member = members.get(id);
    if (!member) return;
    if (!catchers.has(id)) catchers.set(id, { id, ...member, pitches: 0, locations: [] });
    return catchers.get(id);
  };
  for (const side of ["home", "away"] as const) {
    const players = Object.values(teams[side]?.players ?? {}) as Row[];
    for (const p of players) if (finite(p.person?.id)) members.set(p.person.id, { side, name: p.person.fullName ?? "Unknown catcher" });
    const starters = players.filter(p => p.stats?.fielding?.gamesStarted === 1 && p.allPositions?.[0]?.abbreviation === "C");
    if (starters.length === 1) { active[side] = starters[0].person.id; register(starters[0].person.id); }
  }
  let unattributed_pitches = 0;
  for (const play of payload.liveData?.plays?.allPlays ?? []) {
    for (const e of play.playEvents ?? []) {
      const member = members.get(e.player?.id);
      if (e.isSubstitution && member) {
        const side = member.side;
        if (e.position?.abbreviation === "C") { active[side] = e.player.id; register(e.player.id); }
        else if (active[side] === e.player.id || active[side] === e.replacedPlayer?.id) active[side] = null;
      }
      if (!e.isPitch) continue;
      const side = play.about?.halfInning === "top" ? "home" : play.about?.halfInning === "bottom" ? "away" : null;
      const catcher = side && active[side] != null ? register(active[side]!) : undefined;
      if (!catcher) { unattributed_pitches++; continue; }
      catcher.pitches++;
      const pd = e.pitchData ?? {}, x = pd.coordinates?.pX, z = pd.coordinates?.pZ;
      const top = pd.strikeZoneTop, bottom = pd.strikeZoneBottom, hand = play.matchup?.batSide?.code;
      if (finite(x) && finite(z) && finite(top) && finite(bottom) && top > bottom && (hand === "R" || hand === "L")) {
        catcher.locations.push({ x, z: (z - bottom) / (top - bottom), hand, swinging_strike: ["S", "W"].includes(e.details?.call?.code) });
      }
    }
  }
  return { catchers: [...catchers.values()], unattributed_pitches };
}
