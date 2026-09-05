/**
 * An ONGOING tournament that still has at least one playable match pending and
 * has had no match activity (a result loaded, a match (re)scheduled, etc.) in a
 * while. Surfaced to the organizer because a tournament stuck like this never
 * auto-finishes (see `processTournaments` / `isTournamentComplete`) and its
 * ranking points never get awarded until the missing results are loaded.
 */
export interface StaleTournamentDto {
  id: number
  name: string
  /** ISO timestamp of the most recent update across the tournament's matches. */
  lastActivityAt: string
}
