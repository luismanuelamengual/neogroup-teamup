/**
 * Type of a round. Stored as a number in the database (rounds.type).
 *
 * This replaces the former free-text `rounds.bracket` discriminator. A round's
 * parallel structure inside its category is identified by its type, together
 * with the optional `groupNumber` stored in the round's JSONB settings:
 *
 *  - KNOCKOUT             → main knockout bracket (playoff, or the knockout
 *                           phase of a groups+playoff tournament)
 *  - KNOCKOUT_CONSOLATION → the consolation knockout bracket
 *  - LEAGUE               → a round-robin flow. A plain league has
 *                           groupNumber = null; a group of a
 *                           groups+playoff tournament carries its group index
 *                           in groupNumber.
 *                           (A "group of a playoff" is just a league, so both
 *                           share this type — there is no separate value.)
 *  - AMERICANO            → an americano flow (groupNumber = null)
 *
 * Spanish labels: KNOCKOUT = "Eliminatoria", KNOCKOUT_CONSOLATION =
 * "Eliminatoria Consuelo", LEAGUE = "Liga" / "Grupo de Eliminatoria",
 * AMERICANO = "Americana".
 */
export enum RoundType {
  KNOCKOUT = 1,
  KNOCKOUT_CONSOLATION = 2,
  LEAGUE = 3,
  AMERICANO = 4
}

export const RoundTypeNames: Record<RoundType, string> = {
  [RoundType.KNOCKOUT]: 'knockout',
  [RoundType.KNOCKOUT_CONSOLATION]: 'knockout_consolation',
  [RoundType.LEAGUE]: 'league',
  [RoundType.AMERICANO]: 'americano'
}

/** Whether a round type is a knockout bracket (winners advance to the next round). */
export function isKnockoutType(type: RoundType): boolean {
  return type === RoundType.KNOCKOUT || type === RoundType.KNOCKOUT_CONSOLATION
}

/** Whether a round is a group of a groups+playoff tournament (a league with a group index). */
export function isGroupRound(type: RoundType, groupNumber: number | null | undefined): boolean {
  return type === RoundType.LEAGUE && groupNumber != null
}
