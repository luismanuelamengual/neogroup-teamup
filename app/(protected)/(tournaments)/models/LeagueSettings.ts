/** Configurable scoring settings of league tournaments. */
export interface LeagueSettings {
  pointsPerPresent: number
  pointsPerSetWon: number
  pointsPerMatchWon: number
  /**
   * Optional cap on the number of rounds (the league ends after this many rounds).
   *
   * Its meaning flips when `allowUnorderedResults` is on: there are no
   * sequential rounds to cut short, so it is read as the number of MATCHES EACH
   * COMPETITOR PLAYS instead. See `matchesPerCompetitor`.
   */
  maxRounds?: number
  /**
   * When true, the whole round robin is materialised up front and any match can
   * receive its result at any time, in any order — there is no "active" round.
   *
   * Unset (the default) keeps the classic behaviour: one round is created at a
   * time and only the frontier round accepts results.
   */
  allowUnorderedResults?: boolean
  /**
   * When true the league is played "ida y vuelta": the whole round robin runs a
   * second time, so every pair of competitors meets exactly twice.
   *
   * The return leg replays the first one from the start with the sides swapped
   * (the home of the "ida" is the away of the "vuelta"), which doubles the
   * natural number of rounds. `maxRounds` still caps that doubled schedule, and
   * `allowUnorderedResults` still lays all of it out up front.
   */
  doubleRound?: boolean
}

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  pointsPerPresent: 0,
  pointsPerSetWon: 1,
  pointsPerMatchWon: 1
}
