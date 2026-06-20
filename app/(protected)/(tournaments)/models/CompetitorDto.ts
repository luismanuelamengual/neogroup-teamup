/** Serializable representation of a Competitor — safe to pass server→client. */
export interface CompetitorDto {
  id: number
  tournamentCategoryId: number
  userId: number | null
  partnerUserId: number | null
  partnerName: string | null
  displayName: string
  createdAt: string
}
