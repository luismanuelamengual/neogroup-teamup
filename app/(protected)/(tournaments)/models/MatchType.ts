/**
 * Lane a match belongs to inside its category. Stored as a number in the
 * database (matches.type).
 *
 * A match's parallel structure inside its category is identified by its type
 * together with the optional `groupNumber` (matches.groupNumber):
 *
 *  - BRACKET             → main knockout bracket (playoff, or the knockout phase
 *                          of a groups+playoff tournament). Winners advance to the
 *                          next bracket instance (see matches.bracketInstance).
 *  - LEAGUE              → a round-robin flow. A plain league or an americano has
 *                          groupNumber = null; a group of a groups+playoff
 *                          tournament carries its group index in groupNumber.
 *                          (League vs americano scoring is decided by the
 *                          tournament type, not by this value.)
 *  - CONSOLATION_BRACKET → the consolation knockout bracket.
 *
 * Spanish labels: BRACKET = "Eliminatoria", CONSOLATION_BRACKET = "Eliminatoria
 * Consuelo", LEAGUE = "Liga" / "Grupo de Eliminatoria" / "Americana".
 */
export enum MatchType {
  BRACKET = 0,
  LEAGUE = 1,
  CONSOLATION_BRACKET = 2
}

export const MatchTypeNames: Record<MatchType, string> = {
  [MatchType.BRACKET]: 'bracket',
  [MatchType.LEAGUE]: 'league',
  [MatchType.CONSOLATION_BRACKET]: 'consolation_bracket'
}

/** Whether a match type is a knockout bracket (winners advance to the next bracket instance). */
export function isKnockoutType(type: MatchType): boolean {
  return type === MatchType.BRACKET || type === MatchType.CONSOLATION_BRACKET
}

/** Whether a match is a group of a groups+playoff tournament (a league with a group index). */
export function isGroupMatch(type: MatchType, groupNumber: number | null | undefined): boolean {
  return type === MatchType.LEAGUE && groupNumber != null
}
