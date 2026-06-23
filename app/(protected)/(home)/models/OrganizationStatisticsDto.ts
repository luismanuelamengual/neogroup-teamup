/** Stats about the whole organization — payload for the organizer home dashboard. */
export interface OrganizationStatisticsDto {
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
  /** Sum of every still-valid ranking point awarded in the organization. */
  rankingPointsAwarded: number
  /** Distinct players holding at least one still-valid ranking award. */
  rankedPlayers: number
}
