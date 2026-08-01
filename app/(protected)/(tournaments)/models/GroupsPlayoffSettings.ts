/** Configurable settings of "groups + playoff" tournaments. */
export interface GroupsPlayoffSettings {
  /** Target number of competitors per group in the round-robin phase. */
  competitorsPerGroup: number
  /** How many competitors of each group advance to the knockout phase. */
  qualifiersPerGroup: number
  /**
   * Optional floor on the TOTAL number of competitors that reach the knockout
   * phase. When set it takes precedence over `qualifiersPerGroup`, but only
   * upwards: the cut-off level is raised evenly across every group until the
   * total reaches this value (or every competitor already qualified). It is a
   * minimum, so uneven group sizes may overshoot it.
   *
   * Example: 2 groups of 4, `qualifiersPerGroup` 2 and `minPlayoffQualifiers` 6
   * sends the top 3 of each group (6) instead of the top 2 (4).
   */
  minPlayoffQualifiers?: number
  /** Points awarded for showing up (groups phase). */
  pointsPerPresent: number
  /** Points awarded per set won (groups phase). */
  pointsPerSetWon: number
  /** Points awarded for winning a match (groups phase). */
  pointsPerMatchWon: number
  /**
   * Optional cap on the number of group-phase rounds. Once every competitor has
   * played this many rounds, the groups close and the knockout phase starts,
   * even if the round-robin within a group had not finished naturally.
   */
  maxRounds?: number
}

export const DEFAULT_GROUPS_PLAYOFF_SETTINGS: GroupsPlayoffSettings = {
  competitorsPerGroup: 4,
  qualifiersPerGroup: 2,
  pointsPerPresent: 0,
  pointsPerSetWon: 1,
  pointsPerMatchWon: 1
}
