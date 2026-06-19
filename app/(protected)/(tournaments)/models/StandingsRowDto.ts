/** Row of the standings table computed from the resolved matches of a tournament. */
export interface StandingsRowDto {
  competitorId: number
  displayName: string
  played: number
  won: number
  setsWon?: number
  setsLost?: number
  gamesWon?: number
  gamesLost?: number
  points: number
}
