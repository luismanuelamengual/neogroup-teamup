/** Aggregated stats of a player across every tournament they participate in. */
export interface PlayerStatisticsDto {
  tournamentsPlayed: number
  activeTournaments: number
  matchesPlayed: number
  matchesWon: number
  /** Win rate as an integer percentage (0–100). */
  winRate: number
  titles: number
  podiums: number
  /** Sum of the player's still-valid ranking points across categories. */
  rankingPoints: number
  /** Best (lowest) ranking position the player holds in any category, 0 if unranked. */
  bestRankingPosition: number
}
