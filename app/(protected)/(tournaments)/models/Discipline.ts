/** Discipline of a tournament. Stored as a number in the database. */
export enum Discipline {
  PADEL = 1,
  TENNIS = 2
}

export const Disciplines = Object.values(Discipline).filter((value) => typeof value === 'number') as Discipline[]

export const DisciplineNames: Record<Discipline, string> = {
  [Discipline.PADEL]: 'Pádel',
  [Discipline.TENNIS]: 'Tenis'
}
