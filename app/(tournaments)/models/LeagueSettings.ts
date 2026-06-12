/** Configurable scoring settings of league tournaments. */
export interface LeagueSettings {
  pointsPerPresent: number
  pointsPerSetWon: number
  pointsPerMatchWon: number
}

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  pointsPerPresent: 0,
  pointsPerSetWon: 1,
  pointsPerMatchWon: 1
}
