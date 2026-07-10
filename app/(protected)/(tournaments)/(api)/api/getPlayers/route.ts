import { Role } from '@/app/models/Role'
import { User } from '@/app/models/User'
import { withAuth } from '@/app/utils/api-server'

/**
 * POST /api/getPlayers — searches players (roleId = PLAYER) by name, nickname or email (partner selection).
 * An empty query returns a default list of players so the picker isn't empty before the user types anything.
 */
export const POST = withAuth(async (request, context, userId) => {
  const { query } = (await request.json()) as { query?: string }
  const normalized = (query ?? '').trim()

  if (normalized.length === 1) {
    return []
  }

  const playersQuery = User.where('roleId', Role.PLAYER).where('id', '<>', userId)

  if (normalized.length >= 2) {
    const pattern = `%${normalized}%`

    // NOTE: use explicit `ILIKE` (case-insensitive) instead of whereLike/orWhereLike here.
    // Inside this grouping callback, neorm hands us a `ConditionGroup`, whose
    // whereLike/orWhereLike default to plain `LIKE` (case-sensitive on Postgres),
    // unlike the top-level query builder where whereLike defaults to `ILIKE`.
    // That mismatch made searches like "eze" fail to match "Ezequiel" in production.
    playersQuery.where((group) => {
      group
        .where('firstName', 'ILIKE', pattern)
        .orWhere('lastName', 'ILIKE', pattern)
        .orWhere('nickname', 'ILIKE', pattern)
        .orWhere('email', 'ILIKE', pattern)
    })
  }

  const users = await playersQuery.orderBy('firstName').orderBy('lastName').limit(10).get()

  // Strip password before sending to client
  return users.map((user) => {
    user.passwordHash = null

    return user
  })
})
