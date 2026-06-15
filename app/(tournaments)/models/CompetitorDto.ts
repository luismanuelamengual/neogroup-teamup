/** Serializable representation of a Competitor — safe to pass server→client. */
export interface CompetitorDto {
  id: number
  tournamentId: number
  userId: number | null
  partnerUserId: number | null
  partnerName: string | null
  displayName: string
  category: string | null
  createdAt: string
}
