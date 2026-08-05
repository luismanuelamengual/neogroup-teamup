/** Type of a tournament. Stored as a number in the database. */
export enum TournamentType {
  LEAGUE = 1,
  AMERICANO = 2,
  PLAYOFF = 3,
  GROUPS_PLAYOFF = 4,
  // 5 used to be PLAYOFF_WITH_CONSOLATION, now folded into PLAYOFF as the
  // `consolationBracket` setting (see PlayoffSettings.ts and migration 016).
  // 6 used to be AMERICANO_WITH_SWAP ("Americana con intercambio de pareja"):
  // individuals registered alone and rotated partners each round, so
  // matches.homeCompetitorIds/awayCompetitorIds could hold up to 2 competitor
  // ids per side. Removed entirely (see migration 018), which is also why
  // matches now has a single homeCompetitorId/awayCompetitorId instead of
  // those arrays. Left unassigned rather than reused, same reasoning as 5.
  /**
   * Teams of a venue ("sede") facing each other in series of 3 matches. Unlike
   * every other type its structure is not chosen by the organizer: it is
   * derived from how many teams end up registered (see utils/interclubs.ts).
   */
  INTERCLUBS = 7
}

export const TournamentTypes = Object.values(TournamentType).filter(
  (value) => typeof value === 'number'
) as TournamentType[]

export const TournamentTypeNames: Record<TournamentType, string> = {
  [TournamentType.LEAGUE]: 'Liga',
  [TournamentType.AMERICANO]: 'Americana',
  [TournamentType.PLAYOFF]: 'Eliminatoria',
  [TournamentType.GROUPS_PLAYOFF]: 'Grupos + Eliminatoria',
  [TournamentType.INTERCLUBS]: 'Interclubes'
}
