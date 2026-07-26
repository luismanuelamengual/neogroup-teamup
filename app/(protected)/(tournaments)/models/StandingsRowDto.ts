/** Row of the standings table computed from the resolved matches of a tournament. */
export interface StandingsRowDto {
  competitorId: number
  displayName: string
  shortName: string
  played: number
  won: number
  setsWon?: number
  setsLost?: number
  gamesWon?: number
  gamesLost?: number
  /**
   * Interclubes only: individual matches (of the three played in every series)
   * won and lost. They are what separates two teams on the same points.
   */
  subMatchesWon?: number
  subMatchesLost?: number
  points: number
}
