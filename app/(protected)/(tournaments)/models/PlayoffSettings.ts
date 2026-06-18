/** Configurable settings of playoff (knockout) tournaments. */
export interface PlayoffSettings {
  /**
   * When enabled, competitors who lose in the first round of the main bracket
   * move to a parallel "consolation" bracket and play their own knockout.
   */
  consolationBracket: boolean
}

export const DEFAULT_PLAYOFF_SETTINGS: PlayoffSettings = {
  consolationBracket: false
}
