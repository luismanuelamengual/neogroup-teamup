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
  userId: number | null
  partnerUserId: number | null
  displayName: string
  shortName: string
  seedNumber: number | null
  createdAt: string
  /** Embedded user info (populated when user relation is loaded). */
  user?: CompetitorUserInfo | null
  /** Embedded partner user info (populated when partnerUser relation is loaded). */
  partnerUser?: CompetitorUserInfo | null
}
