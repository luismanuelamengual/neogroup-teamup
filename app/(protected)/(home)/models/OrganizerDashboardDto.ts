/** Stats about the whole organization — payload for the organizer home dashboard. */
export interface OrganizationStatsDto {
  tournamentsTotal: number
  tournamentsActive: number
  tournamentsFinished: number
  competitorsTotal: number
  avgCompetitors: number
  /** Distinct platform users that participated in any tournament. */
  distinctPlayers: number
  matchesTotal: number
  matchesPlayed: number
  matchesPending: number
}
