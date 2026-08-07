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
  /**
   * Type-specific attributes. `data.siteId` (interclubes venue) drives same-site
   * avoidance; `data.groupNumber` / `data.groupPosition` hold the group
   * membership frozen when the tournament started (see CompetitorData).
   */
  data?: { siteId?: number | null; groupNumber?: number | null; groupPosition?: number | null } | null
  /** Roster, when loaded — each player's own home site is read off `siteId`. */
  players?: Array<{ siteId?: number | null }> | null
}

/**
 * Resolves a competitor's "sede" (site/venue) for same-site avoidance in
 * bracket/group generation, per this precedence:
 *
 *   1. `data.siteId` — an explicit venue, today only set for interclubes teams.
 *   2. Otherwise, the players' own home site (`User.siteId`), but only when
 *      EVERY player of the competitor shares the same one — a mixed-site pair
 *      has no single site to avoid clashing on.
 *   3. Otherwise, "unassigned": returns `null`.
 *
 * Kept as a standalone pure function (rather than folded into
 * `resolveCompetitorSiteId`) so the engine — which has `playerIds` plus a
 * separately-queried id→site map instead of embedded player objects — can
 * reuse the same precedence rule without duplicating it.
 */
export function resolveSiteId(
  dataSiteId: number | null | undefined,
  playerSiteIds: Array<number | null | undefined>
): number | null {
  if (dataSiteId != null) {
    return dataSiteId
  }

  if (playerSiteIds.length === 0) {
    return null
  }

  const [first, ...rest] = playerSiteIds

  if (first == null) {
    return null
  }

  return rest.every((siteId) => siteId === first) ? first : null
}

/** `resolveSiteId` applied to a `GroupableCompetitor` whose players (if any) are already embedded. */
export function resolveCompetitorSiteId(competitor: GroupableCompetitor): number | null {
  return resolveSiteId(
    competitor.data?.siteId,
    (competitor.players ?? []).map((player) => player.siteId)
  )
}

/** Competitor id → site id, skipping competitors whose site could not be resolved (unassigned). */
export function buildSiteMap(competitors: GroupableCompetitor[]): Map<number, number> {
  const siteOf = new Map<number, number>()

  for (const competitor of competitors) {
    const siteId = resolveCompetitorSiteId(competitor)

    if (siteId != null) {
      siteOf.set(competitor.id, siteId)
    }
  }

  return siteOf
}

/**
 * Rearranges group membership so two competitors from the same site don't end
 * up in the same group when it can be avoided. Best effort, deliberately
 * conservative, mirroring `repairSameGroupPairings`'s swap pass:
 *
 *   - only ever a 1-for-1 swap between two groups, so sizes never change;
 *   - a swap is applied only when it clears the clash without creating a new
 *     one on either side;
 *   - groups/positions are visited in order and the first valid partner wins,
 *     so the result is deterministic;
 *   - it is genuinely best effort — a site with more members than there are
 *     groups always leaves someone paired with a fellow member.
 */
export function repairSameSiteGroups(groups: number[][], siteOf: Map<number, number>): number[][] {
  const hasClash = (group: number[]): boolean => {
    const seen = new Set<number>()

    for (const id of group) {
      const siteId = siteOf.get(id)

      if (siteId == null) {
        continue
      }

      if (seen.has(siteId)) {
        return true
      }

      seen.add(siteId)
    }

    return false
  }

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex]

    for (let position = 0; position < group.length; position++) {
      const id = group[position]
      const siteId = siteOf.get(id)

      if (siteId == null) {
        continue
      }

      // Recomputed fresh (not an incremental running set) because an earlier
      // swap in this same pass can change who sits before `position`.
      const clashesWithEarlierMember = group.slice(0, position).some((earlierId) => siteOf.get(earlierId) === siteId)

      if (!clashesWithEarlierMember) {
        continue
      }

      // `id` clashes with an earlier member of the same site in this group —
      // look for a swap partner in another group, closest index first.
      const otherGroupIndexes = groups
        .map((_, index) => index)
        .filter((index) => index !== groupIndex)
        .sort((a, b) => Math.abs(a - groupIndex) - Math.abs(b - groupIndex))
      let swapped = false

      for (const otherIndex of otherGroupIndexes) {
        const other = groups[otherIndex]

        for (let otherPosition = 0; otherPosition < other.length; otherPosition++) {
          const candidateId = other[otherPosition]

          group[position] = candidateId
          other[otherPosition] = id

          if (!hasClash(group) && !hasClash(other)) {
            swapped = true
            break
          }

          group[position] = id
          other[otherPosition] = candidateId
        }

        if (swapped) {
          break
        }
      }
    }
  }

  return groups
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
 *
 * `siteOf`, when given, triggers a best-effort repair pass afterwards
 * (`repairSameSiteGroups`) so competitors sharing a site avoid landing in the
 * same group — covers both groups+playoff groups and interclubes zones, the
 * only two group-formation paths in the app.
 */
export function buildGroups(
  orderedIds: number[],
  seededCount: number,
  settings: TournamentSettings | null | undefined,
  type: TournamentType = TournamentType.GROUPS_PLAYOFF,
  siteOf?: Map<number, number>
): number[][] {
  const groupSize = settings?.competitorsPerGroup ?? DEFAULT_GROUPS_PLAYOFF_SETTINGS.competitorsPerGroup
  const groupSizes =
    type === TournamentType.INTERCLUBS
      ? interclubsGroupSizes(orderedIds.length)
      : computeGroupSizes(orderedIds.length, groupSize)
  let groups: number[][]

  if (seededCount > 0) {
    groups = snakeSeedGroups(orderedIds.slice(0, seededCount), orderedIds.slice(seededCount), groupSizes)
  } else if (type === TournamentType.INTERCLUBS) {
    // Zones are filled in registration order. `assignGroups` cannot be reused
    // here: it re-derives the zone COUNT with the groups+playoff ceil rule,
    // which is not how interclubes zones are sized.
    groups = []
    let cursor = 0

    for (const size of groupSizes) {
      groups.push(orderedIds.slice(cursor, cursor + size))
      cursor += size
    }
  } else {
    groups = assignGroups(orderedIds, groupSize)
  }

  return siteOf && siteOf.size > 0 ? repairSameSiteGroups(groups, siteOf) : groups
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
  // A tournament that has started carries its membership on the competitors
  // themselves; deriving it again would reshuffle the groups as soon as a late
  // entrant joins (see `storedGroupMembership`).
  const stored = storedGroupMembership(competitors)

  if (stored) {
    return stored
  }

  const orderedIds = sortCompetitorIds(competitors, type)
  const seededCount = competitors.filter((competitor) => competitor.seedNumber != null).length

  return buildGroups(orderedIds, seededCount, settings, type, buildSiteMap(competitors))
}

/**
 * Group membership read back from the competitors themselves, as frozen when the
 * tournament started (`data.groupNumber` / `data.groupPosition`).
 *
 * Returns null — meaning "fall back to deriving it" — unless EVERY competitor
 * carries the pair. All-or-nothing on purpose: a partially frozen category would
 * silently drop the competitors that lack it from their group, which is exactly
 * the kind of failure that only shows up once a standings table is missing a row.
 *
 * Inside a group, members are ordered by their stored `groupPosition` (ties, which
 * should not happen, broken by id so the result is always deterministic). That
 * order matters: the circle-method round robin derives every pairing from it, so
 * reading it back wrong would regenerate a different fixture than the one played.
 */
export function storedGroupMembership(competitors: GroupableCompetitor[]): number[][] | null {
  if (competitors.length === 0) {
    return null
  }

  const entries: Array<{ id: number; groupNumber: number; groupPosition: number }> = []

  for (const competitor of competitors) {
    const groupNumber = competitor.data?.groupNumber
    const groupPosition = competitor.data?.groupPosition

    if (groupNumber == null || groupPosition == null || groupNumber < 0) {
      return null
    }

    entries.push({ id: competitor.id, groupNumber, groupPosition })
  }

  const groupCount = Math.max(...entries.map((entry) => entry.groupNumber)) + 1
  const groups: number[][] = Array.from({ length: groupCount }, () => [])

  for (const entry of [...entries].sort((a, b) => a.groupPosition - b.groupPosition || a.id - b.id)) {
    groups[entry.groupNumber].push(entry.id)
  }

  return groups
}
