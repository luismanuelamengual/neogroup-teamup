/**
 * A player's own match scheduled within the "Tus próximos partidos" home
 * window (the next two weeks). Cross-tournament: one row per upcoming match
 * across every tournament the player currently competes in.
 */
export interface UpcomingMatchDto {
  matchId: number
  tournamentId: number
  tournamentName: string
  /** Category name ("Primera", "4ta"), null for a tournament with a single unlabeled category. */
  categoryName: string | null
  /** Calendar day of the match, 'YYYY-MM-DD'. */
  date: string
  /** Start time of the match, 'HH:mm'. Null until the organizer sets it. */
  hour: string | null
  /** Venue name, resolved from the match's own site or the tournament's default. Null if neither is set. */
  siteName: string | null
  /** Display name of the rival competitor. */
  opponentName: string
}
