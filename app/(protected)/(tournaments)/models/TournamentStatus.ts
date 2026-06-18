/** Status of a tournament. Stored as a number in the database. */
export enum TournamentStatus {
  STAND_BY = 1,
  ONGOING = 2,
  FINISHED = 3
}

export const TournamentStatusNames: Record<TournamentStatus, string> = {
  [TournamentStatus.STAND_BY]: 'stand_by',
  [TournamentStatus.ONGOING]: 'ongoing',
  [TournamentStatus.FINISHED]: 'finished'
}
