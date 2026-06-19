/** Configurable settings of "groups + playoff" tournaments. */
export interface GroupsPlayoffSettings {
  /** Target number of competitors per group in the round-robin phase. */
  competitorsPerGroup: number
  /** How many competitors of each group advance to the knockout phase. */
  qualifiersPerGroup: number
  /** Points awarded for showing up (groups phase). */
  pointsPerPresent: number
  /** Points awarded per set won (groups phase). */
  pointsPerSetWon: number
  /** Points awarded for winning a match (groups phase). */
  pointsPerMatchWon: number
}

export const DEFAULT_GROUPS_PLAYOFF_SETTINGS: GroupsPlayoffSettings = {
  competitorsPerGroup: 4,
  qualifiersPerGroup: 2,
  pointsPerPresent: 0,
  pointsPerSetWon: 1,
  pointsPerMatchWon: 1
}
