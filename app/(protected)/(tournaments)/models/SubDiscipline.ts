/**
 * Sub-discipline of a tournament. Stored as a number in the database.
 * Only tennis uses it (padel is always played in doubles).
 */
export enum SubDiscipline {
  SINGLES = 1,
  DOUBLES = 2
}
