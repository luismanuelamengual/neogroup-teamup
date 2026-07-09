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

    playersQuery.where((group) => {
      group
        .whereLike('firstName', pattern)
        .orWhereLike('lastName', pattern)
        .orWhereLike('nickname', pattern)
        .orWhereLike('email', pattern)
    })
  }

  const users = await playersQuery.orderBy('firstName').orderBy('lastName').limit(10).get()

  // Strip password before sending to client
  return users.map((user) => {
    user.passwordHash = null

    return user
  })
})
