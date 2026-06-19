/** Type of a tournament. Stored as a number in the database. */
export enum TournamentType {
  LEAGUE = 1,
  AMERICANO = 2,
  PLAYOFF = 3,
  GROUPS_PLAYOFF = 4,
  PLAYOFF_WITH_CONSOLATION = 5,
  AMERICANO_WITH_SWAP = 6
}

export const TournamentTypeNames: Record<TournamentType, string> = {
  [TournamentType.LEAGUE]: 'league',
  [TournamentType.AMERICANO]: 'americano',
  [TournamentType.PLAYOFF]: 'playoff',
  [TournamentType.GROUPS_PLAYOFF]: 'groups_playoff',
  [TournamentType.PLAYOFF_WITH_CONSOLATION]: 'playoff_with_consolation',
  [TournamentType.AMERICANO_WITH_SWAP]: 'americano_with_swap'
}
