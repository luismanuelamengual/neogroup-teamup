/** Configurable settings of "groups + playoff" tournaments. */
export interface GroupsPlayoffSettings {
  /** Target number of competitors per group in the round-robin phase. */
  competitorsPerGroup: number
  /** How many competitors of each group advance to the knockout phase. */
  qualifiersPerGroup: number
}

export const DEFAULT_GROUPS_PLAYOFF_SETTINGS: GroupsPlayoffSettings = {
  competitorsPerGroup: 4,
  qualifiersPerGroup: 2
}
