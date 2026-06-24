/** Payload to register the signed-in user (optionally with a partner) into a tournament. */
export interface JoinTournamentInput {
  partnerUserId?: number | null
  /** Category instance (tournament_categories.id) to register into. */
  tournamentCategoryId?: number | null
}
