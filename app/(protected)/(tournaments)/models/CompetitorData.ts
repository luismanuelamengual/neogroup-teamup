/**
 * Extra attributes of a competitor, stored as JSONB in `competitors.data`.
 *
 * The shape depends on the tournament type — today only interclubes uses it,
 * to record the venue (`sites.id`) whose colours the team plays in. Kept as an
 * open bag (like `tournaments.settings`) so a new tournament type can add its
 * own per-competitor attributes without a migration.
 */
export interface CompetitorData {
  /** Venue (sites.id) the interclubes team represents. */
  siteId?: number
}
