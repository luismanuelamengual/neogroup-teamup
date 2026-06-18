/** Type of a tournament. Stored as a number in the database. */
export enum TournamentType {
  LEAGUE = 1,
  AMERICANO = 2,
  PLAYOFF = 3,
  GROUPS_PLAYOFF = 4
}

export const TournamentTypeNames: Record<TournamentType, string> = {
  [TournamentType.LEAGUE]: 'league',
  [TournamentType.AMERICANO]: 'americano',
  [TournamentType.PLAYOFF]: 'playoff',
  [TournamentType.GROUPS_PLAYOFF]: 'groups_playoff'
}
