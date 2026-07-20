/** Serializable representation of a TournamentImage — safe to pass server→client. */
export interface TournamentImageDto {
  id: number
  tournamentId: number
  /** Base64 data URL. */
  image: string
}
