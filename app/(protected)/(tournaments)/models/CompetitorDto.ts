/** Minimal user info embedded in a competitor for display purposes. */
export interface CompetitorUserInfo {
  firstName: string | null
  lastName: string | null
  phoneNumber: string | null
  email: string
}

/** Serializable representation of a Competitor — safe to pass server→client. */
export interface CompetitorDto {
  id: number
  tournamentCategoryId: number
  /** Player user ids in roster order (index 0 is the main player). */
  playerIds: number[]
  displayName: string
  shortName: string
  seedNumber: number | null
  createdAt: string
  /** Embedded player user info in roster order (populated when `players` is loaded). */
  players?: CompetitorUserInfo[]
}
