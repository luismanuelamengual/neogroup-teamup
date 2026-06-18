/** Score format of the matches of a tournament. Stored as a number in the database. */
export enum ScoreFormat {
  THREE_SETS = 1,
  TWO_SETS_SUPER_TIEBREAK = 2,
  BASIC_COUNT = 3
}

export const ScoreFormatNames: Record<ScoreFormat, string> = {
  [ScoreFormat.THREE_SETS]: 'three_sets',
  [ScoreFormat.TWO_SETS_SUPER_TIEBREAK]: 'two_sets_super_tiebreak',
  [ScoreFormat.BASIC_COUNT]: 'basic_count'
}
