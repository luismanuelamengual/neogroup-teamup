import { Ranking } from '@/app/(protected)/(rankings)/models/Ranking'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { TournamentType } from '@/app/(protected)/(tournaments)/models/TournamentType'

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
 * Auto-assigns preclassification numbers from ranking points.
 * Only competitors with at least one ranking point are seeded (up to the cap
 * returned by `getPreclassificationCount`); the rest receive null.
 * The competitor with the most points becomes seed #1, etc.
 */
export async function autoAssignPreclassification(competitors: Competitor[], organizationId: number): Promise<void> {
  if (!competitors.length) {
    return
  }

  const validRankings = await Ranking.withoutGlobalScopes()
    .where('organizationId', organizationId)
    .where('expirationDate', '>', new Date())
    .get()
  const pointsByUser = new Map<number, number>()

  for (const row of validRankings) {
    pointsByUser.set(row.userId, (pointsByUser.get(row.userId) ?? 0) + row.points)
  }

  const scored = competitors.map((c) => {
    const userPoints = pointsByUser.get(c.userId ?? -1) ?? 0
    const partnerPoints = c.partnerUserId != null ? (pointsByUser.get(c.partnerUserId) ?? 0) : 0

    return { competitor: c, points: userPoints + partnerPoints }
  })

  // Sort descending by points; ties resolved by competitor id (stable).
  scored.sort((a, b) => b.points - a.points || a.competitor.id - b.competitor.id)

  const maxSeeds = getPreclassificationCount(competitors.length)
  let nextSeed = 1
  const updates: Record<string, unknown>[] = []

  for (const { competitor, points } of scored) {
    // Only seed competitors that have ranking points, up to the allowed cap.
    competitor.seedNumber = points > 0 && nextSeed <= maxSeeds ? nextSeed++ : null
    // Full row (not just id + seedNumber) so the INSERT branch of the upsert is
    // valid against NOT NULL columns; on conflict only seedNumber is updated.
    updates.push({
      id: competitor.id,
      tournamentCategoryId: competitor.tournamentCategoryId,
      userId: competitor.userId,
      partnerUserId: competitor.partnerUserId,
      seedNumber: competitor.seedNumber,
      createdAt: competitor.createdAt
    })
  }

  // Persist all seed assignments with a single upsert keyed on the primary key
  // instead of one UPDATE per competitor.
  if (updates.length > 0) {
    await Competitor.upsert(updates, 'id', ['seedNumber'])
  }
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
 * Non-seeded competitors are distributed round-robin over the remaining slots.
 */
export function snakeSeedGroups(seededIds: number[], unseededIds: number[], groupCount: number): number[][] {
  const groups: number[][] = Array.from({ length: groupCount }, () => [])

  // Place seeds in snake order
  seededIds.forEach((id, index) => {
    const round = Math.floor(index / groupCount)
    const posInRound = index % groupCount
    const groupIndex = round % 2 === 0 ? posInRound : groupCount - 1 - posInRound

    groups[groupIndex].push(id)
  })

  // Distribute the rest round-robin
  unseededIds.forEach((id, index) => {
    groups[index % groupCount].push(id)
  })

  return groups
}
