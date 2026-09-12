type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const text = (value: unknown): string | null => typeof value === "string" && value ? value : null;
const person = (value: unknown) => ({ id: number(record(value).id), name: text(record(value).fullName) });

export function mlbDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Project only public feed facts. Missing innings/stats remain null, never fabricated zeroes. */
export function buildGameContext(payload: unknown) {
  const root = record(payload);
  const game = record(root.gameData);
  const live = record(root.liveData);
  const line = record(live.linescore);
  const plays = record(live.plays);
  const current = record(plays.currentPlay);
  const matchup = record(current.matchup);
  const offense = record(line.offense);
  const defense = record(line.defense);
  const status = record(game.status);
  const weather = record(game.weather);
  const teams = Object.fromEntries((["away", "home"] as const).map(side => {
    const team = record(record(game.teams)[side]);
    const totals = record(record(line.teams)[side]);
    return [side, { name: text(team.name), abbreviation: text(team.abbreviation), runs: number(totals.runs), hits: number(totals.hits), errors: number(totals.errors) }];
  })) as Record<"away" | "home", { name: string | null; abbreviation: string | null; runs: number | null; hits: number | null; errors: number | null }>;
  const pitcher = Object.keys(record(defense.pitcher)).length ? defense.pitcher : matchup.pitcher;
  const batter = Object.keys(record(offense.batter)).length ? offense.batter : matchup.batter;
  return {
    game_pk: number(root.gamePk),
    state: text(status.abstractGameState), detailed_state: text(status.detailedState),
    start_time: text(record(game.datetime).dateTime), venue: text(record(game.venue).name),
    weather: { condition: text(weather.condition), temperature: text(weather.temp), wind: text(weather.wind) },
    inning: number(line.currentInning), inning_state: text(line.inningState),
    scheduled_innings: number(line.scheduledInnings),
    balls: number(line.balls), strikes: number(line.strikes), outs: number(line.outs),
    teams,
    innings: list(line.innings).map(value => { const inning = record(value); return { num: number(inning.num), away: number(record(inning.away).runs), home: number(record(inning.home).runs) }; }),
    matchup: { batter: person(batter), pitcher: person(pitcher), catcher: person(defense.catcher), on_deck: person(offense.onDeck), batter_hand: text(record(matchup.batSide).code), pitcher_hand: text(record(matchup.pitchHand).code) },
    runners: { first: person(offense.first), second: person(offense.second), third: person(offense.third) },
    probable_pitchers: { away: person(record(game.probablePitchers).away), home: person(record(game.probablePitchers).home) },
    decisions: { winner: person(record(live.decisions).winner), loser: person(record(live.decisions).loser), save: person(record(live.decisions).save) },
    recent_plays: list(plays.allPlays).filter(value => record(record(value).about).isComplete === true).slice(-5).reverse().map(value => {
      const play = record(value); const result = record(play.result); const about = record(play.about);
      return { inning: number(about.inning), half: text(about.halfInning), description: text(result.description), scoring: about.isScoringPlay === true, away_score: number(result.awayScore), home_score: number(result.homeScore) };
    }),
  };
}

export type LiveGameContext = ReturnType<typeof buildGameContext>;
