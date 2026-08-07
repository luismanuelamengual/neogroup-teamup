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
  /**
   * Group phase membership, FROZEN when the tournament starts (groups+playoff
   * only — see `freezeGroupMembership`).
   *
   * Group membership used to be derived on every read from the competitor list
   * (`computeGroupMembership`), which is fine while the field is closed but
   * breaks the moment a competitor is added to an already-running tournament:
   * one more entrant changes `computeGroupSizes`, and the whole distribution —
   * including the groups already being played — is reshuffled. Freezing the
   * membership at start makes what was played immutable, and is what allows a
   * late entrant to be slotted into a specific group (see utils/lateRegistration).
   *
   * Both fields are written together and are only ever absent for tournaments
   * that started before this existed, where the derivation is still used as a
   * fallback.
   */
  groupNumber?: number
  /**
   * Slot of the competitor inside its group, i.e. its index in the group's id
   * array. It cannot be re-derived (the same-site repair pass swaps members
   * across groups, so "seeds first, then the rest" does not hold), and the
   * circle-method round robin depends on the exact order, so it is stored.
   */
  groupPosition?: number
}
