/** Status of a match. Stored as a number in the database. */
export enum MatchStatus {
  PENDING = 1,
  PLAYED = 2,
  WALKOVER = 3,
  /**
   * Consolation-bracket only: this slot is confirmed to never receive an
   * entrant (the competitor who would have dropped into it instead won their
   * first real match in the main bracket). Distinct from PENDING — it will
   * never resolve into a playable match. See `resolveFirstLossSlot` in
   * utils/tournaments.ts.
   */
  VOID = 4
}
