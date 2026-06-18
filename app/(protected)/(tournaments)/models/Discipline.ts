/** Discipline of a tournament. Stored as a number in the database. */
export enum Discipline {
  PADEL = 1,
  TENNIS = 2
}

export const DisciplineNames: Record<Discipline, string> = {
  [Discipline.PADEL]: 'padel',
  [Discipline.TENNIS]: 'tennis'
}
