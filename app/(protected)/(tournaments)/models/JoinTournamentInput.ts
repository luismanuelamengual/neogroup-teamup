/**
 * Payload to register a competitor into a tournament on behalf of the
 * signed-in user.
 *
 * `playerIds` is the roster of the competitor being created, and its length
 * follows the tournament type: a single id for singles, the player plus their
 * partner for pair disciplines, and the whole team (4 players minimum) for
 * interclubes. The signed-in user is always part of it — the server puts them
 * at index 0 (the main player / team captain) whatever the client sends.
 */
export interface JoinTournamentInput {
  /** Roster of the competitor to create, including the signed-in user. */
  playerIds?: number[]
  /** Venue the team represents. Interclubes only, where it is required. */
  siteId?: number | null
  /** Category instance (tournament_categories.id) to register into. */
  tournamentCategoryId?: number | null
}
