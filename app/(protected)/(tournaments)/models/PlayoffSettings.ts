/** Configurable settings of playoff (knockout) tournaments. */
export interface PlayoffSettings {
  /**
   * When true, a consolation bracket runs alongside the main one for the
   * competitors eliminated in its first round (see `createConsolationSkeleton`
   * in utils/tournaments.ts). Unset (the default) keeps the classic single-bracket
   * behaviour.
   *
   * This used to be encoded as a separate tournament type
   * (`PLAYOFF_WITH_CONSOLATION`); it is now a setting of `PLAYOFF` instead — see
   * migration 016 for the one-time conversion of existing rows.
   */
  consolationBracket?: boolean
}

export const DEFAULT_PLAYOFF_SETTINGS: PlayoffSettings = {}
