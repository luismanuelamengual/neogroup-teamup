import { CompetitorDto } from '@/app/(protected)/(tournaments)/models/CompetitorDto'

/**
 * Two rosters are the same side when they hold the same players, in any order.
 *
 * Roster equality is how a side is identified beyond a single tournament: a
 * competitor id only means something inside its own category instance, so "this
 * exact pair" has to be expressed as the set of its players. It is the whole
 * basis of the module — it decides which competitors are the side the URL
 * names, whether a stored match needs flipping to face it, and whether the two
 * sides are actually the same people.
 */
export function isSameRoster(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

/**
 * Upper bound on the roster a URL may name. An interclubes team has no maximum
 * of its own (only a minimum of four), so this is not a domain rule — it is
 * what stops a crafted URL from turning into an unbounded id lookup.
 */
const MAX_SIDE_PLAYERS = 30

/**
 * Parses one side of the head-to-head URL: a single player id for singles, or
 * the comma-separated roster of a pair/team ("1,2"). Returns null for anything
 * that is not a list of distinct positive integers.
 */
export function parseHeadToHeadSide(value: string): number[] | null {
  const parts = decodeURIComponent(value ?? '').split(',')

  if (parts.length === 0 || parts.length > MAX_SIDE_PLAYERS) {
    return null
  }

  const ids: number[] = []

  for (const part of parts) {
    const id = Number(part.trim())

    if (!Number.isInteger(id) || id <= 0 || ids.includes(id)) {
      return null
    }

    ids.push(id)
  }

  return ids
}

/**
 * URL of the head-to-head between two competitors, or null when there is none
 * to link to.
 *
 * The path names PLAYERS, not competitors: a competitor id only exists inside
 * one tournament category, while the head-to-head spans every tournament the
 * two sides ever played. A pair or a team carries its whole roster,
 * comma-separated (`/head-to-head/1,2/5,6`), which is what makes "this exact
 * pair against that exact pair" expressible in the URL.
 *
 * This is the one piece of the module the tournaments side reaches for: it is
 * how a match detail links into the head-to-head, and the single place that
 * decides whether there is one to link to at all. Returns null when either side
 * is missing (a bye, a voided slot, a bracket placeholder), has no roster to
 * name, or when both sides turn out to be the same people.
 */
export function buildHeadToHeadPath(home: CompetitorDto | undefined, away: CompetitorDto | undefined): string | null {
  const homeIds = home?.playerIds ?? []
  const awayIds = away?.playerIds ?? []

  if (homeIds.length === 0 || awayIds.length === 0) {
    return null
  }

  if (isSameRoster(homeIds, awayIds)) {
    return null
  }

  return `/head-to-head/${homeIds.join(',')}/${awayIds.join(',')}`
}
