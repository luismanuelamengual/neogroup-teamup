import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

/**
 * Pure preclassification / seeding helpers — no database models involved, so
 * this module is safe to import from both server code and client components
 * (e.g. the tournament admin page). The DB-backed ranking auto-assignment
 * lives in services/preclassification.ts instead.
 */

/**
 * Whether a tournament type supports pre-classification (seeding).
 * Elimination-style tournaments only — leagues and americanos are excluded.
 */
export function supportsPreclassification(type: TournamentType): boolean {
  return (
    type === TournamentType.PLAYOFF ||
    type === TournamentType.GROUPS_PLAYOFF ||
    type === TournamentType.PLAYOFF_WITH_CONSOLATION
  )
}

/**
 * Maximum number of seeded competitors that makes sense for a given total.
 * Formula: next power-of-two below `count`, capped at 16.
 *
 * Examples:
 *   4    → 2
 *   5–8  → 4
 *   9–16 → 8
 *   17+  → 16
 */
export function getPreclassificationCount(count: number): number {
  if (count < 4) {
    return 2
  }

  const exp = Math.floor(Math.log2(count)) - 1

  return Math.min(Math.pow(2, Math.max(1, exp)), 16)
}

/**
 * Distributes seeded competitors across groups using snake seeding so that
 * top seeds end up in different groups.
 *
 * Seeds are assigned in snake order:
 *   round 1 (seeds 1..G)  → groups 0, 1, 2, ..., G-1
 *   round 2 (seeds G+1..2G) → groups G-1, G-2, ..., 0
 *   ...
 *
 * Non-seeded competitors are distributed round-robin over the remaining
 * slots, respecting each group's target capacity (`groupSizes`, typically
 * from `computeGroupSizes`) so the result always matches the intended
 * balanced sizes — e.g. [4, 4, 3] rather than however the two independent
 * modulo passes happen to land. Without this, a group can be shorted a slot
 * relative to its target while another overflows, in the worst case leaving
 * a group with a single member; group.length < 2 groups only enter the game
 * with a bye later, so a "shorted" competitor silently never gets matches.
 */
export function snakeSeedGroups(seededIds: number[], unseededIds: number[], groupSizes: number[]): number[][] {
  const groupCount = groupSizes.length
  const groups: number[][] = Array.from({ length: groupCount }, () => [])

  // Place seeds in snake order
  seededIds.forEach((id, index) => {
    const round = Math.floor(index / groupCount)
    const posInRound = index % groupCount
    const groupIndex = round % 2 === 0 ? posInRound : groupCount - 1 - posInRound

    groups[groupIndex].push(id)
  })

  // Distribute the rest round-robin, skipping groups that already reached
  // their target size (e.g. because they absorbed more than their share of
  // seeds) so every group ends up exactly at its `groupSizes` capacity.
  let cursor = 0

  unseededIds.forEach((id) => {
    while (groups[cursor % groupCount].length >= groupSizes[cursor % groupCount]) {
      cursor++
    }

    groups[cursor % groupCount].push(id)
    cursor++
  })

  return groups
}
