import { DEFAULT_GROUPS_PLAYOFF_SETTINGS } from '@/app/(protected)/(tournaments)/models/GroupsPlayoffSettings'
import { TournamentSettings } from '@/app/(protected)/(tournaments)/models/TournamentSettings'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'
import { resolveInterclubsFormat } from '@/app/(protected)/(tournaments)/utils/interclubs'
import { snakeSeedGroups, supportsPreclassification } from '@/app/(protected)/(tournaments)/utils/preclassification'

/**
 * Group membership of a round-robin phase (groups+playoff groups, interclubes
 * zones) — who plays in which group, derived purely from the competitors and the
 * tournament settings.
 *
 * It lives in its own model-free module on purpose: membership must be computed
 * **identically** by the engine (which materialises the matches) and by the
 * views (standings tables, group tabs), and the views are client components that
 * cannot import the database-backed engine module. Deriving membership from the
 * already-materialised matches instead is NOT equivalent: a group of odd size
 * rests one competitor per round, so before the whole round robin exists the
 * resting competitor is invisible in the matches — which used to drop the top
 * seed from the group table on the very first round (it is `ids[0]`, the fixed
 * point of the circle method, that sits out round 1).
 */

/** Minimum competitor shape group membership needs. Both `Competitor` and `CompetitorDto` satisfy it. */
export interface GroupableCompetitor {
  id: number
  seedNumber?: number | null
}

/**
 * Balanced group sizes for `competitorsCount` competitors targeting
 * `groupSize` per group. The number of groups is derived from the registered
 * competitors (ceil division); the remainder is spread across the first groups.
 */
export function computeGroupSizes(competitorsCount: number, groupSize: number): number[] {
  const safeGroupSize = Math.max(2, Math.floor(groupSize) || 2)
  const groupCount = Math.max(1, Math.ceil(competitorsCount / safeGroupSize))
  const base = Math.floor(competitorsCount / groupCount)
  const remainder = competitorsCount % groupCount

  return Array.from({ length: groupCount }, (_, index) => base + (index < remainder ? 1 : 0))
}

/**
 * Zone sizes of an interclubes category. Unlike groups+playoff (which targets a
 * configurable group size and derives the COUNT with a ceil division), the
 * number of interclubes zones is `floor(count / 4)` and the leftovers are
 * spread over them, so zones grow instead of multiplying — see
 * `resolveInterclubsFormat`.
 */
export function interclubsGroupSizes(competitorsCount: number): number[] {
  return resolveInterclubsFormat(competitorsCount).groupSizes
}

/**
 * Distributes competitor ids into balanced groups (round-robin assignment, so
 * groups end up as even as possible). Deterministic: the same ordered input
 * always yields the same groups.
 */
export function assignGroups(competitorIds: number[], groupSize: number): number[][] {
  const groupCount = computeGroupSizes(competitorIds.length, groupSize).length
  const groups: number[][] = Array.from({ length: groupCount }, () => [])

  competitorIds.forEach((id, index) => {
    groups[index % groupCount].push(id)
  })

  return groups
}

/**
 * Ordered competitor ids of a category instance. For bracket-style tournaments
 * that support preclassification, seeded competitors come first (seed 1 first),
 * then the rest in registration order (by id), so byes go to the top seeds and
 * the same order is reproducible by every materialisation/seeding helper.
 */
export function sortCompetitorIds(competitors: GroupableCompetitor[], type: TournamentType): number[] {
  const sorted = supportsPreclassification(type)
    ? [...competitors].sort((a, b) => {
        const sa = a.seedNumber ?? Infinity
        const sb = b.seedNumber ?? Infinity

        return sa !== sb ? sa - sb : a.id - b.id
      })
    : [...competitors].sort((a, b) => a.id - b.id)

  return sorted.map((competitor) => competitor.id)
}

/**
 * Splits an ordered list of competitor ids into its groups. Seeded competitors
 * (the first `seededCount` entries of `orderedIds`) are snake-seeded across the
 * groups so the top seeds land in different ones; the rest fill the remaining
 * slots.
 */
export function buildGroups(
  orderedIds: number[],
  seededCount: number,
  settings: TournamentSettings | null | undefined,
  type: TournamentType = TournamentType.GROUPS_PLAYOFF
): number[][] {
  const groupSize = settings?.competitorsPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.competitorsPerGroup
  const groupSizes =
    type === TournamentType.INTERCLUBS
      ? interclubsGroupSizes(orderedIds.length)
      : computeGroupSizes(orderedIds.length, groupSize)

  if (seededCount > 0) {
    return snakeSeedGroups(orderedIds.slice(0, seededCount), orderedIds.slice(seededCount), groupSizes)
  }

  if (type === TournamentType.INTERCLUBS) {
    // Zones are filled in registration order. `assignGroups` cannot be reused
    // here: it re-derives the zone COUNT with the groups+playoff ceil rule,
    // which is not how interclubes zones are sized.
    const groups: number[][] = []
    let cursor = 0

    for (const size of groupSizes) {
      groups.push(orderedIds.slice(cursor, cursor + size))
      cursor += size
    }

    return groups
  }

  return assignGroups(orderedIds, groupSize)
}

/**
 * Group membership of a category from its competitors — the view-side entry
 * point, equivalent to what the engine computes when it materialises the group
 * rounds. Returns one array of competitor ids per group, indexed by the group
 * number the matches carry.
 */
export function computeGroupMembership(
  competitors: GroupableCompetitor[],
  settings: TournamentSettings | null | undefined,
  type: TournamentType = TournamentType.GROUPS_PLAYOFF
): number[][] {
  const orderedIds = sortCompetitorIds(competitors, type)
  const seededCount = competitors.filter((competitor) => competitor.seedNumber != null).length

  return buildGroups(orderedIds, seededCount, settings, type)
}
