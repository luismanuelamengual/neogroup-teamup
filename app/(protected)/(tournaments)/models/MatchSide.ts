/** Side of a match. Stored as a number in the database (matches.winner). */
export enum MatchSide {
  HOME = 1,
  AWAY = 2
}

export const MatchSideNames: Record<MatchSide, 'home' | 'away'> = {
  [MatchSide.HOME]: 'home',
  [MatchSide.AWAY]: 'away'
}
