/**
 * Bracket identifiers used to namespace the parallel structures a tournament
 * can run inside a single category (stored in `rounds.bracket`).
 *  - null            → main bracket / single league or americano flow
 *  - 'consolation'   → playoff consolation bracket
 *  - 'group:N'       → the Nth group of a groups+playoff tournament
 *  - 'playoff'       → the knockout phase of a groups+playoff tournament
 */
export const BRACKET_CONSOLATION = 'consolation'
export const BRACKET_PLAYOFF = 'playoff'
export const GROUP_BRACKET_PREFIX = 'group:'

export const groupBracket = (index: number): string => `${GROUP_BRACKET_PREFIX}${index}`

export const isGroupBracket = (bracket: string | null | undefined): boolean =>
  !!bracket && bracket.startsWith(GROUP_BRACKET_PREFIX)
