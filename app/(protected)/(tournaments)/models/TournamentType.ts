/** Type of a tournament. Stored as a number in the database. */
export enum TournamentType {
  LEAGUE = 1,
  AMERICANO = 2,
  PLAYOFF = 3,
  GROUPS_PLAYOFF = 4,
  PLAYOFF_WITH_CONSOLATION = 5,
  AMERICANO_WITH_SWAP = 6,
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
  [TournamentType.AMERICANO_WITH_SWAP]: 'Americana con intercambio',
  [TournamentType.PLAYOFF]: 'Eliminatoria',
  [TournamentType.PLAYOFF_WITH_CONSOLATION]: 'Eliminatoria con cuadro consuelo',
  [TournamentType.GROUPS_PLAYOFF]: 'Grupos + Eliminatoria',
  [TournamentType.INTERCLUBS]: 'Interclubes'
}
