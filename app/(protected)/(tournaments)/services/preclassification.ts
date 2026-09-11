import { Ranking } from '@/app/(protected)/(rankings)/models/Ranking'
import { Competitor } from '@/app/(protected)/(tournaments)/models/Competitor'
import { TournamentCategory } from '@/app/(protected)/(tournaments)/models/TournamentCategory'
import { getPreclassificationCount } from '@/app/(protected)/(tournaments)/utils/preclassification'

/**
 * Auto-assigns preclassification numbers from ranking points.
 * Only competitors with at least one ranking point are seeded (up to the cap
 * returned by `getPreclassificationCount`); the rest receive null.
 * The competitor with the most points becomes seed #1, etc.
 *
 * Seeding is computed independently per `tournamentCategoryId`: each category
 * gets its own seed #1, #2, ... based only on the competitors registered in
 * that category, so a tournament with multiple categories never mixes seeds
 * across them (a competitor's seed must never depend on how strong the other
 * category is).
 *
 * Ranking points themselves are also scoped to the catalogue category
 * (`Ranking.categoryId` / `TournamentCategory.categoryId`), not just summed
 * per player: a player who is #1 in category C but has never played category
 * B must start with 0 points — and no seed — when they register in B. Points
 * earned in one catalogue category must never leak into another one just
 * because it is the same player. `tournamentCategories` is how the caller
 * tells this function which catalogue category each `tournamentCategoryId`
 * belongs to.
 *
 * Manual seeds take priority over ranking. A competitor can only have a
 * non-null `seedNumber` before the tournament starts if the organizer set it
 * by hand from the admin page (nothing else assigns one before this function
 * runs), so any competitor that already has a seed when this runs is treated
 * as manually "locked": it keeps its number, and ranking only fills in the
 * remaining seed slots (1..maxSeeds) around it. A category may never end up
 * with two seeded competitors sharing the same number — if more than one
 * manual seed collides on the same value, only one (the lowest competitor id)
 * keeps it; the rest are demoted back to ranking-based assignment like any
 * other unseeded competitor.
 *
 * This function touches Ranking/Competitor (DB models scoped to the current
 * request's organization), so it deliberately lives under services/ — not
 * utils/preclassification.ts — which stays free of database models so it can
 * also be imported by client components (e.g. the tournament admin page).
 */
export async function autoAssignPreclassification(
  competitors: Competitor[],
  tournamentCategories: TournamentCategory[]
): Promise<void> {
  if (!competitors.length) {
    return
  }

  // Both filters that used to be spelled out here — this organization, not
  // expired yet — are the Ranking entity's own global scopes.
  const validRankings = await Ranking.get()
  // Keyed by "userId:categoryId" — a player's points must stay scoped to the
  // catalogue category they were earned in (see the note above).
  const pointsByUserAndCategory = new Map<string, number>()

  for (const row of validRankings) {
    const key = `${row.userId}:${row.categoryId}`

    pointsByUserAndCategory.set(key, (pointsByUserAndCategory.get(key) ?? 0) + row.points)
  }

  const categoryIdByTournamentCategoryId = new Map(
    tournamentCategories.map((tournamentCategory) => [tournamentCategory.id, tournamentCategory.categoryId])
  )
  // Group by category first: seeds must be computed independently within each
  // tournament category, not across the whole tournament.
  const competitorsByCategory = new Map<number, Competitor[]>()

  for (const c of competitors) {
    const group = competitorsByCategory.get(c.tournamentCategoryId)

    if (group) {
      group.push(c)
    } else {
      competitorsByCategory.set(c.tournamentCategoryId, [c])
    }
  }

  const updates: Record<string, unknown>[] = []

  for (const categoryCompetitors of competitorsByCategory.values()) {
    // A pre-existing seedNumber at this point can only be a manual one (the
    // organizer's choice from the admin page) — resolve collisions first: keep
    // the number on the lowest competitor id and clear the rest so they fall
    // back to ranking-based assignment below, same as any other unseeded
    // competitor.
    const lockedBySeed = new Map<number, Competitor>()

    for (const c of categoryCompetitors) {
      if (c.seedNumber == null) {
        continue
      }

      const holder = lockedBySeed.get(c.seedNumber)

      if (!holder) {
        lockedBySeed.set(c.seedNumber, c)
      } else if (c.id < holder.id) {
        holder.seedNumber = null
        lockedBySeed.set(c.seedNumber, c)
      } else {
        c.seedNumber = null
      }
    }

    const lockedNumbers = new Set(lockedBySeed.keys())
    const unlocked = categoryCompetitors.filter((c) => c.seedNumber == null)
    // Every competitor here shares the same tournamentCategoryId, so they all
    // resolve to the same catalogue category.
    const catalogueCategoryId =
      categoryIdByTournamentCategoryId.get(categoryCompetitors[0].tournamentCategoryId) ?? null
    const scored = unlocked.map((c) => {
      // Sum the ranking points of every player that makes up the competitor,
      // counting only points earned in this same catalogue category.
      const points = c.playerIds.reduce(
        (sum, id) => sum + (pointsByUserAndCategory.get(`${id}:${catalogueCategoryId}`) ?? 0),
        0
      )

      return { competitor: c, points }
    })

    // Sort descending by points; ties resolved by competitor id (stable).
    scored.sort((a, b) => b.points - a.points || a.competitor.id - b.competitor.id)

    const maxSeeds = getPreclassificationCount(categoryCompetitors.length)
    // Ranking only fills the slots a manual seed hasn't already claimed.
    const availableSeeds: number[] = []

    for (let seed = 1; seed <= maxSeeds; seed++) {
      if (!lockedNumbers.has(seed)) {
        availableSeeds.push(seed)
      }
    }

    let nextSeedIndex = 0

    for (const { competitor, points } of scored) {
      // Only seed competitors that have ranking points, up to the allowed cap.
      competitor.seedNumber =
        points > 0 && nextSeedIndex < availableSeeds.length ? availableSeeds[nextSeedIndex++] : null
    }

    for (const competitor of categoryCompetitors) {
      // Full row (not just id + seedNumber) so the INSERT branch of the upsert is
      // valid against NOT NULL columns; on conflict only seedNumber is updated.
      updates.push({
        id: competitor.id,
        tournamentCategoryId: competitor.tournamentCategoryId,
        playerIds: competitor.playerIds,
        seedNumber: competitor.seedNumber,
        createdAt: competitor.createdAt
      })
    }
  }

  // Persist every seed assignment in a single batch upsert keyed on the primary
  // key. (Requires neorm ≥ the build that keeps the conflict-target column in the
  // INSERT, so `ON CONFLICT (id)` matches instead of duplicating every row.)
  if (updates.length > 0) {
    await Competitor.upsert(updates, 'id', ['seedNumber'])
  }
}
