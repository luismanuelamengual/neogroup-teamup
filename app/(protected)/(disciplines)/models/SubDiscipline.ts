/**
 * Sub-discipline of a tournament. Stored as a number in the database.
 * Only tennis uses it (padel is always played in doubles).
 */
export enum SubDiscipline {
  SINGLES = 1,
  DOUBLES = 2
}

export const SubDisciplines = Object.values(SubDiscipline).filter(
  (value) => typeof value === 'number'
) as SubDiscipline[]

export const SubDisciplineNames: Record<SubDiscipline, string> = {
  [SubDiscipline.SINGLES]: 'Singles',
  [SubDiscipline.DOUBLES]: 'Dobles'
}
