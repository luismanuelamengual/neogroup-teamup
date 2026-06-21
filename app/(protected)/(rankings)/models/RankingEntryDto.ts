/**
 * One row of the rankings browser: a player together with the sum of their
 * still-valid ranking points for the queried category (or set of categories).
 */
export interface RankingEntryDto {
  userId: number
  displayName: string
  /** Email used to resolve the player's avatar. */
  email: string
  /** Sum of non-expired ranking points. */
  points: number
}
