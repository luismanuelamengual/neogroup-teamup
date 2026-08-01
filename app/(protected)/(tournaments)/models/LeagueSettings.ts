/** Configurable scoring settings of league tournaments. */
export interface LeagueSettings {
  pointsPerPresent: number
  pointsPerSetWon: number
  pointsPerMatchWon: number
  /** Optional cap on the number of rounds (the league ends after this many rounds). */
  maxRounds?: number
}

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  pointsPerPresent: 0,
  pointsPerSetWon: 1,
  pointsPerMatchWon: 1
}
